import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { VersioningType, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import rawRequest from 'supertest';
import type { Server } from 'node:http';
import pg from 'pg';
import * as bcrypt from 'bcrypt';
import { generate } from 'otplib';
import {
  Role,
  adminNextStepSchema,
  adminEnrollmentCompleteSchema,
  adminSessionResponseSchema,
} from '@talent-nexus/contracts';
import { AppModule } from '../src/app.module';
import {
  AdminAuthService,
  type AdminPrincipal,
} from '../src/admin-auth/admin-auth.service';
import { AdminCryptoService } from '../src/admin-auth/admin-crypto.service';
import { configureApiResponseHandling } from '../src/common/http/configure-api-response-handling';
import { applyZodSchemasToSwagger } from '../src/common/swagger/zod-swagger';
import { db } from '../src/prisma/db';

const connection = process.env.ADMIN_JOBS_TEST_DATABASE_URL;
if (
  !connection ||
  process.env.DATABASE_URL !== connection ||
  new URL(connection).hostname !== '127.0.0.1' ||
  new URL(connection).pathname !== '/admin_jobs_fixture'
)
  throw new Error('Isolated fixture database required');
const mockUrl = process.env.ADMIN_EMAIL_TEST_URL;
if (!mockUrl || !mockUrl.startsWith('http://127.0.0.1:'))
  throw new Error('Local email simulation required');
const pool = new pg.Pool({ connectionString: connection });
const base = '/api/v1/admin/auth';
const password = 'StaffPassword123!';
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
type WireData = {
  id: string;
  email: string;
  role: Role.Admin;
  access_token: string;
  recoveryCodes: string[];
  secret: string;
  challengeToken: string;
  nextStep: string;
  existingAccount: boolean;
};
type WireResponse = Omit<rawRequest.Response, 'body' | 'headers'> & {
  body: { data: WireData; meta: { limit: number } };
  headers: Record<string, string> & { 'set-cookie': string[] };
};
type WireTest = Omit<
  rawRequest.Test,
  'then' | 'expect' | 'auth' | 'send' | 'set'
> &
  PromiseLike<WireResponse> & {
    expect(status: number): WireTest;
    auth(token: string, options: { type: 'bearer' }): WireTest;
    send(body: object): WireTest;
    set(name: string, value: string): WireTest;
  };
const request = (server: Server) =>
  rawRequest(server) as unknown as {
    get(path: string): WireTest;
    post(path: string): WireTest;
  };
let app: INestApplication<Server>;
let auth: AdminAuthService;
let adminCrypto: AdminCryptoService;
let actor: AdminPrincipal;
let actorToken: string;
let actorCodes: string[];
let actorCookie: string;

function post(path: string, body: object = {}) {
  return request(app.getHttpServer()).post(`${base}/${path}`).send(body);
}
function manage(path: string, body: object = {}) {
  return request(app.getHttpServer())
    .post(`/api/v1/admin/${path}`)
    .auth(actorToken, { type: 'bearer' })
    .send(body);
}
async function capturedToken(email: string) {
  const messages = (await (
    await fetch(`${mockUrl}/_test/messages`)
  ).json()) as { to: { email: string }[]; htmlContent: string }[];
  const message = messages
    .filter((m: { to: { email: string }[] }) => m.to[0].email === email)
    .at(-1);
  expect(message).toBeTruthy();
  if (!message) throw new Error('No invitation captured');
  const token = message.htmlContent.match(/#token=([^"<]+)/)?.[1];
  if (!token) throw new Error('Invitation link missing');
  return decodeURIComponent(token);
}
async function enroll(
  email: string,
  token: string,
  accountPassword = password,
  isExisting = false,
) {
  const accepted = await post('invitations/accept', {
    token,
    password: accountPassword,
    ...(isExisting ? {} : { confirmPassword: accountPassword }),
  }).expect(200);
  expect(adminNextStepSchema.parse(accepted.body.data) != null).toBe(true);
  const challengeToken = accepted.body.data.challengeToken;
  const setup = await post('mfa/enrollment', { challengeToken }).expect(200);
  expect(setup.headers['cache-control']).toBe('no-store');
  const enrollmentCode = await generate({ secret: setup.body.data.secret });
  const confirmed = await post('mfa/enrollment/confirm', {
    challengeToken,
    code: enrollmentCode,
  }).expect(200);
  expect(adminEnrollmentCompleteSchema.parse(confirmed.body.data) != null).toBe(
    true,
  );
  return {
    ...confirmed.body.data,
    cookie: confirmed.headers['set-cookie'][0].split(';')[0],
    secret: setup.body.data.secret,
    challengeToken,
    enrollmentCode,
  };
}
async function addAdmin(email: string, existingPassword?: string) {
  await manage('invitations', { name: 'Other Admin', email }).expect(201);
  return enroll(
    email,
    await capturedToken(email),
    existingPassword ?? password,
    Boolean(existingPassword),
  );
}
async function loginChallenge(email = actor.email) {
  const result = await post('login', { email, password }).expect(200);
  expect(result.body.data).not.toHaveProperty('access_token');
  return result.body.data.challengeToken;
}

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.useLogger(false);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  configureApiResponseHandling(app);
  await app.init();
  auth = app.get(AdminAuthService);
  adminCrypto = app.get(AdminCryptoService);
});
beforeEach(async () => {
  await pool.query(
    'TRUNCATE public.job, public."user", public."adminInvitation", public."adminAuthAttempt" CASCADE',
  );
  await fetch(`${mockUrl}/_test/reset`, { method: 'POST' });
  // Reset only IP buckets between independent test scenarios; persistent account limits remain under test.
  const { ThrottlerStorage } = await import('@nestjs/throttler');
  const storage = app.get<unknown>(ThrottlerStorage) as {
    storage: Map<string, unknown>;
  };
  storage.storage.clear();
  const invitation = await auth.operator('bootstrap', {
    email: 'owner@example.com',
    name: 'Owner',
  });
  expect(invitation).not.toHaveProperty('token');
  const session = await enroll(
    'owner@example.com',
    await capturedToken('owner@example.com'),
  );
  actorToken = session.access_token;
  actorCodes = session.recoveryCodes;
  actorCookie = session.cookie;
  const claims = app.get(JwtService).decode<{ sid: string }>(actorToken);
  actor = {
    id: session.id,
    email: session.email,
    role: session.role,
    adminSessionId: claims.sid,
  };
});
afterAll(async () => {
  await app?.close();
  await db.close();
  await pool.end();
});

describe('Admin authentication through HTTP and PostgreSQL', () => {
  it('bootstraps through emailed enrollment, authenticates profile and protects secret material', async () => {
    const response = await request(app.getHttpServer())
      .get(`${base}/profile`)
      .auth(actorToken, { type: 'bearer' })
      .expect(200);
    expect(response.body.data).toMatchObject({
      email: actor.email,
      mfaEnabled: true,
    });
    expect(actorCookie).toMatch(/^talent_nexus_admin_refresh=/);
    const rows = await pool.query<{ secretCiphertext: string }>(
      'SELECT "secretCiphertext" FROM public."adminMembership" WHERE "userId"=$1',
      [actor.id],
    );
    expect(rows.rows[0].secretCiphertext.split('.')).toHaveLength(3);
    const codes = await pool.query(
      'SELECT "codeHash" FROM public."adminRecoveryCode"',
    );
    expect(codes.rows).toHaveLength(10);
    expect(JSON.stringify(codes.rows)).not.toContain(actorCodes[0]);
    await expect(
      auth.operator('bootstrap', { email: 'new@example.com', name: 'New' }),
    ).rejects.toThrow('active administrator');
  });
  it('blocks role-only legacy, ordinary and non-admin tokens on jobs and user lists', async () => {
    const jwt = app.get(JwtService);
    for (const role of ['ADMIN', 'TALENT', 'RECRUITER']) {
      const token = jwt.sign({ sub: actor.id, email: actor.email, role });
      await request(app.getHttpServer())
        .get('/api/v1/admin/jobs')
        .auth(token, { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .auth(token, { type: 'bearer' })
        .expect(403);
    }
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    const users = await request(app.getHttpServer())
      .get('/api/v1/users')
      .auth(actorToken, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(users.body)).not.toMatch(
      /password|secretCiphertext|tokenHash/,
    );
    const normal = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: actor.email, password })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .auth(normal.body.data.access_token, { type: 'bearer' })
      .expect(403);
  });
  it('requires MFA after password and consumes recovery codes once under concurrent verification', async () => {
    const challengeToken = await loginChallenge();
    const responses = await Promise.all([
      post('mfa/recovery', { challengeToken, recoveryCode: actorCodes[0] }),
      post('mfa/recovery', { challengeToken, recoveryCode: actorCodes[0] }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
    const again = await loginChallenge();
    await post('mfa/recovery', {
      challengeToken: again,
      recoveryCode: actorCodes[0],
    }).expect(401);
  });
  it('rejects reused enrollment codes and accepts a fresh authenticator code', async () => {
    const invitation = await manage('invitations', {
      name: 'MFA Staff',
      email: 'mfa@example.com',
    }).expect(201);
    expect(invitation.body.data).not.toHaveProperty('tokenHash');
    const session = await enroll(
      'mfa@example.com',
      await capturedToken('mfa@example.com'),
    );
    const challengeToken = await loginChallenge('mfa@example.com');
    const code = session.enrollmentCode;
    await post('mfa/verify', { challengeToken, code }).expect(401);
    // Reset the stored last step to model a later login without waiting on wall-clock time.
    await pool.query(
      'UPDATE public."adminMembership" SET "lastTotpStep"=-1 WHERE "userId"=$1',
      [session.id],
    );
    const signedIn = await post('mfa/verify', { challengeToken, code }).expect(
      200,
    );
    expect(
      adminSessionResponseSchema.safeParse(signedIn.body.data).success,
    ).toBe(true);
    await post('mfa/verify', { challengeToken, code }).expect(401);
  });
  it('expires challenges and locks a challenge after five failed proofs', async () => {
    const challengeToken = await loginChallenge();
    for (let i = 0; i < 5; i++)
      await post('mfa/recovery', {
        challengeToken,
        recoveryCode: 'bad-code',
      }).expect(401);
    await post('mfa/recovery', {
      challengeToken,
      recoveryCode: actorCodes[0],
    }).expect(401);
    const next = await loginChallenge();
    await pool.query(
      'UPDATE public."adminChallenge" SET "expiresAt"=now()-interval \'1 second\' WHERE "tokenHash"=$1',
      [hash(next)],
    );
    await post('mfa/recovery', {
      challengeToken: next,
      recoveryCode: actorCodes[0],
    }).expect(401);
  });
  it('persists account attempt limits across separate requests', async () => {
    for (let i = 0; i < 10; i++)
      await post('login', { email: actor.email, password: 'wrong' }).expect(
        401,
      );
    await post('login', { email: actor.email, password }).expect(429);
  });
  it('converts an existing recruiter without changing password, ID or original role', async () => {
    const user = await db.orm.public.User.create({
      email: 'recruiter@example.com',
      password: await bcrypt.hash('ExistingPass1!', 10),
      name: 'Recruiter',
      role: 'RECRUITER',
      termAccepted: true,
    });
    const session = await addAdmin(user.email, 'ExistingPass1!');
    expect(session.id).toBe(user.id);
    const member = await db.orm.public.AdminMembership.where({
      userId: user.id,
    }).first();
    expect(member?.originalRole).toBe('RECRUITER');
    expect(
      (await db.orm.public.User.where({ id: user.id }).first())?.password,
    ).toBe(user.password);
    await manage(`administrators/${user.id}/disable`).expect(204);
    expect(
      (await db.orm.public.User.where({ id: user.id }).first())?.role,
    ).toBe('RECRUITER');
    await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .auth(session.access_token, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'ExistingPass1!' })
      .expect(200);
  });
  it('rejects wrong existing-account passwords, weak new passwords and mismatched confirmation', async () => {
    await manage('invitations', {
      name: 'New',
      email: 'new@example.com',
    }).expect(201);
    const token = await capturedToken('new@example.com');
    await post('invitations/accept', {
      token,
      password: 'Short1!',
      confirmPassword: 'Short1!',
    }).expect(400);
    await post('invitations/accept', {
      token,
      password,
      confirmPassword: 'different',
    }).expect(400);
    await post('invitations/accept', {
      token,
      password,
      confirmPassword: password,
    }).expect(200);
    await post('invitations/accept', {
      token,
      password,
      confirmPassword: password,
    }).expect(400);
  });
  it('resumes incomplete onboarding without granting access, and revocation stops it', async () => {
    const invitation = await manage('invitations', {
      name: 'Pending',
      email: 'pending@example.com',
    }).expect(201);
    const token = await capturedToken('pending@example.com');
    const accepted = await post('invitations/accept', {
      token,
      password,
      confirmPassword: password,
    }).expect(200);
    expect(
      (await db.orm.public.User.where({ email: 'pending@example.com' }).first())
        ?.role,
    ).toBe('TALENT');
    const challengeToken = await loginChallenge('pending@example.com');
    await post('mfa/enrollment', { challengeToken }).expect(200);
    await manage(`invitations/${invitation.body.data.id}/revoke`).expect(204);
    await post('mfa/enrollment', {
      challengeToken: accepted.body.data.challengeToken,
    }).expect(401);
    await post('login', { email: 'pending@example.com', password }).expect(401);
  });
  it('resends with a new token, enforces cooldown and invalidates the old link', async () => {
    const invitation = await manage('invitations', {
      name: 'Pending',
      email: 'pending@example.com',
    }).expect(201);
    const first = await capturedToken('pending@example.com');
    await manage(`invitations/${invitation.body.data.id}/resend`).expect(429);
    await pool.query(
      'UPDATE public."adminInvitation" SET "lastSentAt"=now()-interval \'61 seconds\' WHERE id=$1',
      [invitation.body.data.id],
    );
    await manage(`invitations/${invitation.body.data.id}/resend`).expect(200);
    const second = await capturedToken('pending@example.com');
    expect(second).not.toBe(first);
    await post('invitations/inspect', { token: first }).expect(400);
    const inspected = await post('invitations/inspect', {
      token: second,
    }).expect(200);
    expect(inspected.body.data.existingAccount).toBe(false);
    await pool.query(
      'UPDATE public."adminInvitation" SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',
      [invitation.body.data.id],
    );
    await post('invitations/inspect', { token: second }).expect(400);
  });
  it('handles delivery failure by revoking the undelivered link and reporting 503', async () => {
    await fetch(`${mockUrl}/_test/fail`, { method: 'POST' });
    await manage('invitations', {
      name: 'Failure',
      email: 'failure@example.com',
    }).expect(503);
    expect(
      (
        await db.orm.public.AdminInvitation.where({
          email: 'failure@example.com',
        }).first()
      )?.state,
    ).toBe('REVOKED');
    await fetch(`${mockUrl}/_test/reset`, { method: 'POST' });
    await manage('invitations', {
      name: 'Failure',
      email: 'failure@example.com',
    }).expect(201);
  });
  it('rotates refresh cookies, rejects replay, and revokes the matching access token', async () => {
    const result = await post('refresh').set('Cookie', actorCookie).expect(200);
    expect(result.headers['set-cookie'][0]).toContain(
      'Path=/api/v1/admin/auth',
    );
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(result.headers['set-cookie'][0]).toContain('SameSite=Lax');
    const nextCookie = result.headers['set-cookie'][0].split(';')[0];
    expect(nextCookie).not.toBe(actorCookie);
    await post('refresh').set('Cookie', actorCookie).expect(401);
    await post('refresh').set('Cookie', nextCookie).expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .auth(result.body.data.access_token, { type: 'bearer' })
      .expect(401);
  });
  it('keeps ordinary refresh and admin refresh isolated', async () => {
    const normal = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: actor.email, password })
      .expect(200);
    const cookie = normal.headers['set-cookie'][0].split(';')[0];
    await post('refresh').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        actorCookie.replace(
          'talent_nexus_admin_refresh=',
          'talent_nexus_refresh=',
        ),
      )
      .expect(401);
  });
  it('enforces absolute session expiry on access and refresh', async () => {
    await pool.query(
      'UPDATE public."authSession" SET "absoluteExpiresAt"=now()-interval \'1 second\' WHERE id=$1',
      [actor.adminSessionId],
    );
    await post('refresh').set('Cookie', actorCookie).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/profile`)
      .auth(actorToken, { type: 'bearer' })
      .expect(401);
  });
  it('revokes access immediately on logout and supports idempotent logout', async () => {
    await post('logout').set('Cookie', actorCookie).expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .auth(actorToken, { type: 'bearer' })
      .expect(401);
    await post('logout').set('Cookie', actorCookie).expect(204);
  });
  it('revokes all sessions on logout-all', async () => {
    const challengeToken = await loginChallenge();
    const other = await post('mfa/recovery', {
      challengeToken,
      recoveryCode: actorCodes[0],
    }).expect(200);
    await post('logout-all').auth(actorToken, { type: 'bearer' }).expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .auth(other.body.data.access_token, { type: 'bearer' })
      .expect(401);
  });
  it('regenerates recovery codes after fresh proof and invalidates the previous set', async () => {
    const next = await post('mfa/recovery-codes/regenerate', {
      password,
      recoveryCode: actorCodes[0],
    })
      .auth(actorToken, { type: 'bearer' })
      .expect(200);
    expect(next.body.data.recoveryCodes).toHaveLength(10);
    const challengeToken = await loginChallenge();
    await post('mfa/recovery', {
      challengeToken,
      recoveryCode: actorCodes[1],
    }).expect(401);
    await post('mfa/recovery', {
      challengeToken,
      recoveryCode: next.body.data.recoveryCodes[0],
    }).expect(200);
  });
  it('protects self-disable and serializes two administrators attempting mutual disable', async () => {
    await manage(`administrators/${actor.id}/disable`).expect(409);
    const other = await addAdmin('other@example.com');
    const attempts = await Promise.all([
      manage(`administrators/${other.id}/disable`),
      request(app.getHttpServer())
        .post(`/api/v1/admin/administrators/${actor.id}/disable`)
        .auth(other.access_token, { type: 'bearer' })
        .send({}),
    ]);
    expect(attempts.filter((r) => r.status === 204)).toHaveLength(1);
    expect(
      await db.orm.public.AdminMembership.where({ state: 'ACTIVE' }).all(),
    ).toHaveLength(1);
  });
  it('requires operator recovery after losing all factors and invalidates old credentials', async () => {
    await auth.operator('recover', { email: actor.email, name: 'Owner' });
    await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .auth(actorToken, { type: 'bearer' })
      .expect(401);
    const session = await enroll(
      actor.email,
      await capturedToken(actor.email),
      password,
      true,
    );
    const challengeToken = await loginChallenge();
    await post('mfa/recovery', {
      challengeToken,
      recoveryCode: actorCodes[0],
    }).expect(401);
    expect(session.id).toBe(actor.id);
  });
  it('retains MFA through ordinary password reset and revokes admin sessions', async () => {
    const oldChallenge = await loginChallenge();
    const token = adminCrypto.token();
    await db.orm.public.AuthActionToken.create({
      userId: actor.id,
      purpose: 'PASSWORD_RESET',
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        token,
        password: 'ChangedPassword123!',
        confirmPassword: 'ChangedPassword123!',
      })
      .expect(200);
    await request(app.getHttpServer())
      .get(`${base}/profile`)
      .auth(actorToken, { type: 'bearer' })
      .expect(401);
    await post('mfa/recovery', {
      challengeToken: oldChallenge,
      recoveryCode: actorCodes[0],
    }).expect(401);
    const next = await post('login', {
      email: actor.email,
      password: 'ChangedPassword123!',
    }).expect(200);
    expect(next.body.data.nextStep).toBe('MFA_VERIFICATION');
  });
  it('lists safe paginated membership and invitation records and rejects duplicate invitations', async () => {
    await manage('invitations', {
      email: 'new@example.com',
      name: 'New',
    }).expect(201);
    await manage('invitations', {
      email: 'new@example.com',
      name: 'New',
    }).expect(409);
    await manage('invitations', { email: actor.email, name: 'Owner' }).expect(
      409,
    );
    for (const path of ['administrators', 'invitations']) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/admin/${path}?limit=1`)
        .auth(actorToken, { type: 'bearer' })
        .expect(200);
      expect(response.body.meta.limit).toBe(1);
      expect(JSON.stringify(response.body)).not.toMatch(
        /tokenHash|secretCiphertext|password/,
      );
    }
  });
  it('rejects malformed refresh IDs without a database error', async () => {
    await post('refresh')
      .set(
        'Cookie',
        `talent_nexus_admin_refresh=${'-'.repeat(36)}.${'a'.repeat(43)}`,
      )
      .expect(401);
  });
  it('checks current role and membership rather than trusting an unexpired JWT', async () => {
    await db.orm.public.User.where({ id: actor.id }).update({ role: 'TALENT' });
    await request(app.getHttpServer())
      .get('/api/v1/admin/jobs')
      .auth(actorToken, { type: 'bearer' })
      .expect(401);
    await post('refresh').set('Cookie', actorCookie).expect(401);
  });
  it('requires the existing user password before converting their account', async () => {
    await db.orm.public.User.create({
      email: 'existing@example.com',
      password: await bcrypt.hash('ExistingPassword1!', 10),
      role: 'TALENT',
      termAccepted: true,
    });
    await manage('invitations', {
      email: 'existing@example.com',
      name: 'Existing',
    }).expect(201);
    const token = await capturedToken('existing@example.com');
    await post('invitations/accept', { token, password: 'wrong' }).expect(401);
    const inspected = await post('invitations/inspect', { token }).expect(200);
    expect(inspected.body.data.existingAccount).toBe(true);
    await post('invitations/accept', {
      token,
      password: 'ExistingPassword1!',
    }).expect(200);
  });
  it('documents next-step, MFA and final-session shapes in Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    applyZodSchemasToSwagger(document, app.get(ModulesContainer));
    expect(document.paths[`${base}/login`].post?.responses['200']).toBeTruthy();
    expect(document.components?.schemas?.AdminMfaVerifyDto).toBeTruthy();
  });
});
