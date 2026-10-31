import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { VersioningType, type INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ModulesContainer } from '@nestjs/core';
import request from 'supertest';
import pg from 'pg';
import {
  Role,
  createAdminJobSchema,
  updateAdminJobSchema,
  adminJobsQuerySchema,
  adminJobDetailSchema,
  adminJobSummarySchema,
  type JobStatus,
  type AdminJobDetail,
  type AdminJobSummary,
  type ApiPaginatedResponse,
} from '@talent-nexus/contracts';
import { AdminAuthService } from '../src/admin-auth/admin-auth.service';
import { AdminAuthRepository } from '../src/admin-auth/admin-auth.repository';
import { AdminCryptoService } from '../src/admin-auth/admin-crypto.service';
import { AdminEmailService } from '../src/admin-auth/admin-email.service';
import { JobsModule } from '../src/jobs/jobs.module';
import { JobsRepository } from '../src/jobs/jobs.repository';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { IngestionRepository } from '../src/ingestion/ingestion.repository';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { configureApiResponseHandling } from '../src/common/http/configure-api-response-handling';
import { applyZodSchemasToSwagger } from '../src/common/swagger/zod-swagger';
import { db } from '../src/prisma/db';

const adminId = randomUUID();
const adminSessionId = randomUUID();
const secret = 'isolated-admin-job-test-secret';
const jwt = new JwtService({ secret });
const content = {
  title: 'Accountant',
  companyName: 'Example Company',
  description: 'Prepare accounts',
  location: 'Yangon',
  sourceUrl: 'https://example.com/jobs/1',
  applicationUrl: [],
};
const sourceJob = { ...content, externalId: 'source-fixture-1' };
const token = (role = Role.Admin) =>
  jwt.sign({
    sub: adminId,
    email: 'admin@example.com',
    role,
    sid: adminSessionId,
    amr: ['pwd', 'mfa'],
    aud: 'talentnexus-admin',
  });
const base = '/api/v1/admin/jobs';
// Defense in depth even if someone runs this file without the dedicated config.
const fixtureConnection = process.env.ADMIN_JOBS_TEST_DATABASE_URL;
if (!fixtureConnection || process.env.DATABASE_URL !== fixtureConnection) {
  throw new Error(
    'Run this suite with vitest.admin-jobs.config.ts and an isolated fixture database',
  );
}
const fixtureTarget = new URL(fixtureConnection);
if (
  fixtureTarget.hostname !== '127.0.0.1' ||
  fixtureTarget.pathname !== '/admin_jobs_fixture'
) {
  throw new Error('Refusing admin job tests against a non-fixture database');
}
let app: INestApplication<Server>;
let repository: JobsRepository;
let ingestionRepository: IngestionRepository;
let ingestion: IngestionService;
const pool = new pg.Pool({
  connectionString: process.env.ADMIN_JOBS_TEST_DATABASE_URL,
});

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';
type DetailBody = { success: boolean; data: AdminJobDetail };
type ListBody = ApiPaginatedResponse<AdminJobSummary>;
type TypedResponse<T> = Omit<request.Response, 'body'> & { body: T };
type TypedRequest<T> = Omit<request.Test, 'then' | 'expect'> & {
  then: PromiseLike<TypedResponse<T>>['then'];
  expect(status: number): TypedRequest<T>;
};

function call<T = DetailBody>(method: HttpMethod, path = '', body?: object) {
  const req = request(app.getHttpServer())
    [method](`${base}${path}`)
    .auth(token(), { type: 'bearer' });
  // Supertest's wire JSON is checked against shared schemas in the suite.
  return (body === undefined
    ? req
    : req.send(body)) as unknown as TypedRequest<T>;
}
async function create(overrides = {}) {
  const response = await call('post', '', { ...content, ...overrides }).expect(
    201,
  );
  expect(adminJobDetailSchema.safeParse(response.body.data).success).toBe(true);
  return response.body.data;
}

@Global()
@Module({
  providers: [
    AdminAuthService,
    AdminAuthRepository,
    { provide: AdminCryptoService, useValue: {} },
    { provide: AdminEmailService, useValue: {} },
    { provide: JwtService, useValue: jwt },
    { provide: ConfigService, useValue: { getOrThrow: () => secret } },
  ],
  exports: [AdminAuthService],
})
class FixtureAdminAuthModule {}

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [FixtureAdminAuthModule, JobsModule],
    providers: [
      JwtStrategy,
      { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
    ],
  }).compile();
  app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  configureApiResponseHandling(app);
  await app.init();
  repository = module.get(JobsRepository);
  ingestionRepository = new IngestionRepository();
  ingestion = new IngestionService(ingestionRepository);
});

beforeEach(async () => {
  await pool.query('TRUNCATE public.job, public."user" CASCADE');
  await db.orm.public.User.create({
    id: adminId,
    email: 'admin@example.com',
    role: 'ADMIN',
    termAccepted: true,
  });
  await db.orm.public.AdminMembership.create({
    userId: adminId,
    state: 'ACTIVE',
    secretCiphertext: 'fixture-only',
  });
  await db.orm.public.AuthSession.create({
    id: adminSessionId,
    userId: adminId,
    purpose: 'ADMIN',
    refreshTokenHash: randomUUID(),
    mfaVerifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
});

afterAll(async () => {
  await app?.close();
  await db.close();
  await pool.end();
});

describe('Admin job contracts and HTTP authorization', () => {
  it('validates defaults, URL protocols, versions, empty patches, and unknown fields', () => {
    expect(adminJobsQuerySchema.parse({})).toMatchObject({
      deletion: 'active',
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    for (const input of [{ limit: 101 }, { sortBy: 'password' }, { page: 0 }]) {
      expect(adminJobsQuerySchema.safeParse(input).success).toBe(false);
    }
    expect(
      createAdminJobSchema.safeParse({
        ...content,
        sourceUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(
      createAdminJobSchema.safeParse({ ...content, status: 'PUBLISHED' })
        .success,
    ).toBe(false);
    expect(
      updateAdminJobSchema.safeParse({ expectedVersion: 0, content: {} })
        .success,
    ).toBe(false);
  });

  it('protects every route from unauthenticated and both non-admin roles', async () => {
    const id = randomUUID();
    const routes: [HttpMethod, string][] = [
      ['get', ''],
      ['get', `/${id}`],
      ['post', ''],
      ['patch', `/${id}`],
      ...['publish', 'reject', 'close', 'reopen', 'restore'].map(
        (action): [HttpMethod, string] => ['post', `/${id}/${action}`],
      ),
      ['delete', `/${id}`],
    ];
    for (const [method, path] of routes) {
      await request(app.getHttpServer())[method](`${base}${path}`).expect(401);
      for (const role of [Role.Talent, Role.Recruiter]) {
        await request(app.getHttpServer())
          [method](`${base}${path}`)
          .auth(token(role), { type: 'bearer' })
          .expect(403);
      }
    }
    await request(app.getHttpServer())
      .get(base)
      .auth('invalid', { type: 'bearer' })
      .expect(401);
  });

  it('returns shared validation errors and missing-record errors', async () => {
    const invalid = await call('post', '', {
      ...content,
      sourceId: 'forged',
    }).expect(400);
    expect(invalid.body).toMatchObject({
      success: false,
      message: 'Validation failed',
    });
    await call('get', '/invalid-id').expect(400);
    await call('get', `/${randomUUID()}`).expect(404);
    await call('patch', `/${randomUUID()}`, {
      expectedVersion: 0,
      content: { title: 'New' },
    }).expect(404);
    await call('get', '?limit=101').expect(400);
  });

  it('generates Swagger with the Zod mutation schemas', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    applyZodSchemasToSwagger(doc, app.get(ModulesContainer));
    expect(Object.keys(doc.paths)).toHaveLength(7);
    expect(
      Object.values(doc.paths).flatMap((path) => Object.keys(path)),
    ).toHaveLength(10);
    expect(doc.components?.schemas?.CreateAdminJobDto).toHaveProperty(
      'additionalProperties',
      false,
    );
    expect(doc.components?.schemas?.UpdateAdminJobDto).toHaveProperty(
      'properties.expectedVersion',
    );
    expect(
      doc.paths[base].get?.parameters?.map(
        (parameter) => 'name' in parameter && parameter.name,
      ),
    ).toContain('deletion');
  });
});

describe('Job lifecycle and optimistic concurrency', () => {
  it('creates manual identities and supports atomic publish, immediate edit, close, reopen, and republish', async () => {
    const initial = await create();
    expect(initial).toMatchObject({
      sourceId: 'manual',
      status: 'PENDING',
      version: 0,
      lastAdminAction: 'CREATE',
      lastAdminActionById: adminId,
      applicationUrl: [],
    });
    expect(initial.externalId).toMatch(/^[a-f0-9-]{36}$/);
    const published = (
      await call('post', `/${initial.id}/publish`, {
        expectedVersion: 0,
        content: { title: 'Approved title' },
      }).expect(200)
    ).body.data;
    expect(published).toMatchObject({
      title: 'Approved title',
      status: 'PUBLISHED',
      version: 1,
      reviewedById: adminId,
    });
    const edited = (
      await call('patch', `/${initial.id}`, {
        expectedVersion: 1,
        content: { location: 'Mandalay' },
      }).expect(200)
    ).body.data;
    expect(edited).toMatchObject({
      status: 'PUBLISHED',
      location: 'Mandalay',
      version: 2,
    });
    const closed = (
      await call('post', `/${initial.id}/close`, { expectedVersion: 2 }).expect(
        200,
      )
    ).body.data;
    expect(closed.closedAt).not.toBeNull();
    const reopened = (
      await call('post', `/${initial.id}/reopen`, {
        expectedVersion: 3,
      }).expect(200)
    ).body.data;
    expect(reopened).toMatchObject({
      status: 'PENDING',
      closedAt: null,
      version: 4,
    });
    const republished = (
      await call('post', `/${initial.id}/publish`, {
        expectedVersion: 4,
      }).expect(200)
    ).body.data;
    expect(republished.publishedAt).toBe(published.publishedAt);
  });

  it('requires reasons, rejects stale writes, and does not modify immutable fields', async () => {
    const job = await create();
    for (const note of [undefined, '', '   ']) {
      await call('post', `/${job.id}/reject`, {
        expectedVersion: 0,
        note,
      }).expect(400);
      await call('delete', `/${job.id}`, { expectedVersion: 0, note }).expect(
        400,
      );
    }
    await call('patch', `/${job.id}`, {
      expectedVersion: 0,
      content: { title: 'Edited', sourceId: 'forged' },
    }).expect(400);
    await call('patch', `/${job.id}`, {
      expectedVersion: 0,
      content: {},
    }).expect(400);
    const rejected = (
      await call('post', `/${job.id}/reject`, {
        expectedVersion: 0,
        note: 'Duplicate listing',
      }).expect(200)
    ).body.data;
    expect(rejected).toMatchObject({
      status: 'REJECTED',
      reviewNote: 'Duplicate listing',
      lastAdminActionNote: 'Duplicate listing',
    });
    await call('post', `/${job.id}/reopen`, { expectedVersion: 0 }).expect(409);
    await call('patch', `/${job.id}`, {
      expectedVersion: 1,
      content: { title: 'Corrected' },
    }).expect(200);
  });

  it.each(['PENDING', 'PUBLISHED', 'REJECTED', 'CLOSED'] as const)(
    'deletes %s jobs and restores only to pending',
    async (status) => {
      const job = await create();
      await db.orm.public.Job.where({ id: job.id }).update({ status });
      const deleted = (
        await call('delete', `/${job.id}`, {
          expectedVersion: 0,
          note: 'Remove listing',
        }).expect(200)
      ).body.data;
      expect(deleted.deletedAt).not.toBeNull();
      expect(deleted.lastAdminAction).toBe('DELETE');
      expect(
        (await call<ListBody>('get', '').expect(200)).body.data,
      ).toHaveLength(0);
      expect(
        (await call<ListBody>('get', '?deletion=deleted').expect(200)).body
          .data,
      ).toHaveLength(1);
      expect(
        (await call('get', `/${job.id}`).expect(200)).body.data.deletedAt,
      ).not.toBeNull();
      for (const action of ['publish', 'reject', 'close', 'reopen']) {
        await call('post', `/${job.id}/${action}`, {
          expectedVersion: 1,
          note: 'Reason',
        }).expect(409);
      }
      await call('patch', `/${job.id}`, {
        expectedVersion: 1,
        content: { title: 'Hidden edit' },
      }).expect(409);
      await call('delete', `/${job.id}`, {
        expectedVersion: 1,
        note: 'Again',
      }).expect(409);
      const restored = (
        await call('post', `/${job.id}/restore`, { expectedVersion: 1 }).expect(
          200,
        )
      ).body.data;
      expect(restored).toMatchObject({
        status: 'PENDING',
        deletedAt: null,
        closedAt: null,
        version: 2,
        lastAdminAction: 'RESTORE',
      });
      expect(restored.adminEditedAt).not.toBeNull();
      await call('post', `/${job.id}/restore`, { expectedVersion: 2 }).expect(
        409,
      );
    },
  );

  it('rejects invalid transitions across all statuses', async () => {
    const allowed: Record<string, JobStatus[]> = {
      publish: ['PENDING'],
      reject: ['PENDING'],
      close: ['PUBLISHED'],
      reopen: ['REJECTED', 'CLOSED'],
    };
    for (const status of [
      'PENDING',
      'PUBLISHED',
      'REJECTED',
      'CLOSED',
    ] as const) {
      for (const action of Object.keys(allowed)) {
        const job = await create();
        await db.orm.public.Job.where({ id: job.id }).update({ status });
        await call('post', `/${job.id}/${action}`, {
          expectedVersion: 0,
          note: 'Review decision',
        }).expect(allowed[action].includes(status) ? 200 : 409);
      }
    }
  });

  it('lets only one of two simultaneous edits succeed', async () => {
    const job = await create();
    const results = await Promise.all(
      ['First', 'Second'].map((title) =>
        call('patch', `/${job.id}`, { expectedVersion: 0, content: { title } }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await repository.findById(job.id))?.version).toBe(1);
  });

  it('validates merged publication content before applying final edits', async () => {
    const job = await create();
    await db.orm.public.Job.where({ id: job.id }).update({ description: '' });
    await call('post', `/${job.id}/publish`, {
      expectedVersion: 0,
      content: { title: 'Should not save' },
    }).expect(400);
    expect((await repository.findById(job.id))?.title).toBe(content.title);
    await call('post', `/${job.id}/publish`, {
      expectedVersion: 0,
      content: { description: 'Now complete' },
    }).expect(200);
  });
});

describe('Filtering and pagination against PostgreSQL', () => {
  it('applies filters, escaped literal text, totals, sorting, and out-of-range pagination', async () => {
    await create({
      title: 'Senior Accountant',
      companyName: 'Acme',
      location: 'Yangon',
    });
    const special = await create({
      title: '100%_\\ role',
      companyName: 'Acme',
      location: 'Mandalay',
    });
    const published = await create({
      title: 'Engineer',
      companyName: 'Beta',
      location: 'Yangon',
    });
    await call('post', `/${published.id}/publish`, {
      expectedVersion: 0,
    }).expect(200);
    const deleted = await create({ title: 'Deleted' });
    await call('delete', `/${deleted.id}`, {
      expectedVersion: 0,
      note: 'Fixture',
    }).expect(200);

    for (const [query, expected] of [
      ['title=account', 1],
      ['companyName=acme', 2],
      ['location=yangon', 2],
      ['sourceId=manual', 3],
      ['status=PUBLISHED', 1],
      [
        'companyName=acme&location=yangon&status=PENDING&sourceId=manual&title=senior',
        1,
      ],
      [`title=${encodeURIComponent('%_\\')}`, 1],
      ['deletion=all', 4],
      ['deletion=deleted', 1],
    ] as const) {
      const response = await call<ListBody>('get', `?${query}`).expect(200);
      expect(response.body.meta.total).toBe(expected);
      expect(response.body.data).toHaveLength(expected);
      expect(
        response.body.data.every(
          (row) => adminJobSummarySchema.safeParse(row).success,
        ),
      ).toBe(true);
      if (query.startsWith('title=%'))
        expect(response.body.data[0].id).toBe(special.id);
    }
    for (const sortBy of [
      'createdAt',
      'updatedAt',
      'lastSeenAt',
      'publishedAt',
      'title',
      'companyName',
    ]) {
      for (const sortOrder of ['asc', 'desc']) {
        const query = `sortBy=${sortBy}&sortOrder=${sortOrder}`;
        const full = (await call<ListBody>('get', `?${query}`).expect(200))
          .body;
        const one = (
          await call<ListBody>('get', `?${query}&limit=1`).expect(200)
        ).body;
        const two = (
          await call<ListBody>('get', `?${query}&limit=1&page=2`).expect(200)
        ).body;
        expect([one.data[0].id, two.data[0].id]).toEqual(
          full.data.slice(0, 2).map((row) => row.id),
        );
        expect(one.meta).toMatchObject({
          total: 3,
          totalPages: 3,
          hasNextPage: true,
          hasPreviousPage: false,
        });
      }
    }
    const outside = (
      await call<ListBody>('get', '?page=99&limit=1').expect(200)
    ).body;
    expect(outside.data).toEqual([]);
    expect(outside.meta).toMatchObject({
      page: 99,
      total: 3,
      hasNextPage: false,
    });
    const empty = (
      await call<ListBody>('get', '?title=nonexistent').expect(200)
    ).body;
    expect(empty.meta).toMatchObject({ total: 0, totalPages: 0 });
  });
});

describe('Crawler preservation and race conditions', () => {
  it('refreshes changed pending content, but observation-only writes preserve version', async () => {
    await ingestion.ingestJobs({ sourceId: 'fixture', jobs: [sourceJob] });
    let job = (await ingestionRepository.findBySource(
      'fixture',
      sourceJob.externalId,
    ))!;
    expect(job.version).toBe(0);
    await ingestion.ingestJobs({ sourceId: 'fixture', jobs: [sourceJob] });
    expect((await repository.findById(job.id))?.version).toBe(0);
    await ingestion.ingestJobs({
      sourceId: 'fixture',
      jobs: [{ ...sourceJob, title: 'Source changed' }],
    });
    job = (await repository.findById(job.id))!;
    expect(job).toMatchObject({ version: 1, title: 'Source changed' });
    await call('patch', `/${job.id}`, {
      expectedVersion: 0,
      content: { title: 'Stale admin edit' },
    }).expect(409);
  });

  it('protects edited pending, published, rejected, closed, deleted, reopened, and restored content', async () => {
    for (const scenario of [
      'edited',
      'published',
      'rejected',
      'closed',
      'deleted',
      'reopened',
      'restored',
    ]) {
      const externalId = `fixture-${scenario}`;
      await ingestion.ingestJobs({
        sourceId: 'fixture',
        jobs: [{ ...sourceJob, externalId }],
      });
      const job = (await ingestionRepository.findBySource(
        'fixture',
        externalId,
      ))!;
      const id = job.id;
      if (scenario === 'edited')
        await call('patch', `/${id}`, {
          expectedVersion: 0,
          content: { title: 'Admin title' },
        }).expect(200);
      if (['published', 'closed', 'reopened'].includes(scenario))
        await call('post', `/${id}/publish`, { expectedVersion: 0 }).expect(
          200,
        );
      if (['closed', 'reopened'].includes(scenario))
        await call('post', `/${id}/close`, { expectedVersion: 1 }).expect(200);
      if (scenario === 'reopened')
        await call('post', `/${id}/reopen`, { expectedVersion: 2 }).expect(200);
      if (scenario === 'rejected')
        await call('post', `/${id}/reject`, {
          expectedVersion: 0,
          note: 'Rejected',
        }).expect(200);
      if (['deleted', 'restored'].includes(scenario))
        await call('delete', `/${id}`, {
          expectedVersion: 0,
          note: 'Deleted',
        }).expect(200);
      if (scenario === 'restored')
        await call('post', `/${id}/restore`, { expectedVersion: 1 }).expect(
          200,
        );
      await db.orm.public.Job.where({ id }).update({
        lastSeenAt: '2000-01-01T00:00:00Z',
      });
      const before = (await repository.findById(id))!;
      await ingestion.ingestJobs({
        sourceId: 'fixture',
        jobs: [{ ...sourceJob, externalId, title: 'Must not overwrite' }],
      });
      const after = (await repository.findById(id))!;
      expect(after).toMatchObject({
        title: before.title,
        status: before.status,
        version: before.version,
        deletedAt: before.deletedAt,
      });
      expect(new Date(after.lastSeenAt).getFullYear()).toBeGreaterThan(2000);
    }
  });

  it('rejects a stale crawler write after admin publication and a stale admin write after crawler changes', async () => {
    await ingestion.ingestJobs({ sourceId: 'fixture', jobs: [sourceJob] });
    const old = (await ingestionRepository.findBySource(
      'fixture',
      sourceJob.externalId,
    ))!;
    await call('post', `/${old.id}/publish`, { expectedVersion: 0 }).expect(
      200,
    );
    await ingestionRepository.updatePendingJob(
      'fixture',
      { ...sourceJob, title: 'Late crawl' },
      old.version,
    );
    expect((await repository.findById(old.id))?.title).toBe(sourceJob.title);

    const fresh = await ingestionRepository.createPendingJob('fixture', {
      ...sourceJob,
      externalId: 'race-2',
    });
    await ingestionRepository.updatePendingJob(
      'fixture',
      { ...sourceJob, externalId: 'race-2', title: 'New source' },
      fresh.version,
    );
    expect(
      await repository.compareAndUpdate(fresh, { title: 'Stale admin' }),
    ).toBeNull();
    expect((await repository.findById(fresh.id))?.title).toBe('New source');
  });

  it('blocks in-flight crawler content updates after admin edit or deletion', async () => {
    for (const action of ['edit', 'delete']) {
      const externalId = `in-flight-${action}`;
      const original = await ingestionRepository.createPendingJob('fixture', {
        ...sourceJob,
        externalId,
      });
      if (action === 'edit') {
        await call('patch', `/${original.id}`, {
          expectedVersion: 0,
          content: { title: 'Admin owns this' },
        }).expect(200);
      } else {
        await call('delete', `/${original.id}`, {
          expectedVersion: 0,
          note: 'Deleted while crawling',
        }).expect(200);
      }
      const protectedJob = (await repository.findById(original.id))!;
      await ingestionRepository.updatePendingJob(
        'fixture',
        { ...sourceJob, externalId, title: 'Late source change' },
        original.version,
      );
      expect(await repository.findById(original.id)).toMatchObject({
        title: protectedJob.title,
        version: protectedJob.version,
        deletedAt: protectedJob.deletedAt,
      });
    }
  });

  it('retains jobs when the admin user is deleted and clears nullable actor links', async () => {
    const job = await create();
    await call('post', `/${job.id}/publish`, { expectedVersion: 0 }).expect(
      200,
    );
    await db.orm.public.User.where({ id: adminId }).delete();
    expect(await repository.findById(job.id)).toMatchObject({
      status: 'PUBLISHED',
      reviewedById: null,
      lastAdminActionById: null,
      lastAdminAction: 'PUBLISH',
    });
  });
});
