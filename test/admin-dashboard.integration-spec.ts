import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { Test } from '@nestjs/testing';
import { VersioningType, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ModulesContainer } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import pg from 'pg';
import {
  adminCategorySchema,
  publicCategorySchema,
  categorySubscriptionSchema,
  categorySubscriberSchema,
  adminJobDetailSchema,
  adminJobsSummarySchema,
  adminJobSourcesSchema,
  adminAnalyticsOverviewSchema,
  type AdminCategory,
  type PaginationMeta,
  type AdminJobDetail,
} from '@talent-nexus/contracts';
import { AppModule } from '../src/app.module';
import { configureApiResponseHandling } from '../src/common/http/configure-api-response-handling';
import { applyZodSchemasToSwagger } from '../src/common/swagger/zod-swagger';
import { db } from '../src/prisma/db';
import { AdminAnalyticsService } from '../src/admin-analytics/admin-analytics.service';
import { IngestionRepository } from '../src/ingestion/ingestion.repository';

const url = process.env.ADMIN_JOBS_TEST_DATABASE_URL;
if (
  !url ||
  process.env.DATABASE_URL !== url ||
  new URL(url).hostname !== '127.0.0.1' ||
  new URL(url).pathname !== '/admin_jobs_fixture'
)
  throw new Error('Only the disposable dashboard fixture database is allowed');
const pool = new pg.Pool({ connectionString: url });
let app: INestApplication<Server>;
let jwt: JwtService;
let adminId: string;
let candidateId: string;
let adminToken: string;
let candidateToken: string;
const base = '/api/v1';
const content = {
  title: 'Accountant',
  companyName: 'Company',
  description: 'Prepare accounts',
  location: 'Yangon',
  sourceUrl: 'https://example.com/jobs/1',
  applicationUrl: [],
};
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type WireResponse<T> = Omit<request.Response, 'body'> & {
  body: { success: boolean; data: T; meta: PaginationMeta };
};
type WireTest<T> = Omit<request.Test, 'then' | 'expect'> &
  PromiseLike<WireResponse<T>> & { expect(status: number): WireTest<T> };
function call<T = unknown>(
  method: Method,
  path: string,
  token: string | null = adminToken,
  body?: object,
) {
  let req = request(app.getHttpServer())[method](`${base}${path}`);
  if (token) req = req.auth(token, { type: 'bearer' });
  if (body) req = req.send(body);
  return req as unknown as WireTest<T>;
}
async function createCategory(values: object = {}): Promise<AdminCategory> {
  return adminCategorySchema.parse(
    (
      await call('post', '/admin/categories', adminToken, {
        name: 'Accounting',
        ...values,
      }).expect(201)
    ).body.data,
  );
}
async function createJob(values: object = {}): Promise<AdminJobDetail> {
  return adminJobDetailSchema.parse(
    (
      await call('post', '/admin/jobs', adminToken, {
        ...content,
        ...values,
      }).expect(201)
    ).body.data,
  );
}
async function archive(category: AdminCategory) {
  return adminCategorySchema.parse(
    (
      await call(
        'post',
        `/admin/categories/${category.id}/archive`,
        adminToken,
        { expectedVersion: category.version },
      ).expect(200)
    ).body.data,
  );
}
async function seededJob(values: {
  publishedAt: string;
  status?: 'PUBLISHED' | 'CLOSED' | 'REJECTED';
  deletedAt?: string;
}) {
  return db.orm.public.Job.create({
    ...content,
    sourceId: 'fixture',
    externalId: randomUUID(),
    status: values.status ?? 'PUBLISHED',
    ...values,
  });
}
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  configureApiResponseHandling(app);
  await app.init();
  jwt = app.get(JwtService);
});
beforeEach(async () => {
  await pool.query(
    'TRUNCATE public.job, public."user", public.category, public."adminInvitation", public."adminAuthAttempt" CASCADE',
  );
  adminId = randomUUID();
  candidateId = randomUUID();
  const sessionId = randomUUID();
  await db.orm.public.User.create({
    id: adminId,
    email: 'staff@example.com',
    role: 'ADMIN',
    termAccepted: true,
  });
  await db.orm.public.User.create({
    id: candidateId,
    email: 'candidate@example.com',
    name: 'Candidate',
    role: 'TALENT',
    termAccepted: true,
  });
  await db.orm.public.AdminMembership.create({
    userId: adminId,
    state: 'ACTIVE',
    secretCiphertext: 'guard-fixture-only',
  });
  await db.orm.public.AuthSession.create({
    id: sessionId,
    userId: adminId,
    purpose: 'ADMIN',
    refreshTokenHash: randomUUID(),
    mfaVerifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  adminToken = jwt.sign({
    sub: adminId,
    email: 'staff@example.com',
    role: 'ADMIN',
    sid: sessionId,
    aud: 'talentnexus-admin',
    amr: ['pwd', 'mfa'],
  });
  candidateToken = jwt.sign({
    sub: candidateId,
    email: 'candidate@example.com',
    role: 'TALENT',
  });
});
afterAll(async () => {
  await app?.close();
  await db.close();
  await pool.end();
});

describe('Category management and subscription APIs', () => {
  it('protects every new admin route with current MFA authorization', async () => {
    const id = randomUUID();
    const endpoints: [Method, string, object?][] = [
      ['get', '/admin/categories'],
      ['post', '/admin/categories', { name: 'New' }],
      ['get', `/admin/categories/${id}`],
      ['patch', `/admin/categories/${id}`, { expectedVersion: 0, name: 'New' }],
      ['post', `/admin/categories/${id}/archive`, { expectedVersion: 0 }],
      ['post', `/admin/categories/${id}/restore`, { expectedVersion: 0 }],
      ['get', `/admin/categories/${id}/subscribers`],
      ['get', '/admin/jobs/summary'],
      ['get', '/admin/jobs/sources'],
      ['get', '/admin/analytics/overview'],
    ];
    const legacy = jwt.sign({
      sub: adminId,
      email: 'staff@example.com',
      role: 'ADMIN',
    });
    for (const [method, path, body] of endpoints) {
      await call(method, path, null, body).expect(401);
      await call(method, path, candidateToken, body).expect(403);
      await call(method, path, legacy, body).expect(403);
    }
  });
  it('normalizes names, enforces uniqueness across archived records, and never exposes internal keys', async () => {
    const category = await createCategory({
      name: ' Accounting ',
      description: ' Finance ',
    });
    expect(category).toMatchObject({
      name: 'Accounting',
      description: 'Finance',
      status: 'ACTIVE',
      version: 0,
      subscriberCount: 0,
      assignedJobCount: 0,
    });
    await call('post', '/admin/categories', adminToken, {
      name: 'accounting',
    }).expect(409);
    await archive(category);
    await call('post', '/admin/categories', adminToken, {
      name: 'ACCOUNTING',
    }).expect(409);
    const detail = await call('get', `/admin/categories/${category.id}`).expect(
      200,
    );
    expect(detail.body.data).not.toHaveProperty('normalizedName');
  });
  it('handles version conflicts and restores an archived category to hidden', async () => {
    const category = await createCategory();
    const results = await Promise.all([
      call('patch', `/admin/categories/${category.id}`, adminToken, {
        expectedVersion: 0,
        name: 'One',
      }),
      call('patch', `/admin/categories/${category.id}`, adminToken, {
        expectedVersion: 0,
        name: 'Two',
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = adminCategorySchema.parse(
      (await call('get', `/admin/categories/${category.id}`)).body.data,
    );
    const archived = await archive(current);
    await call('patch', `/admin/categories/${category.id}`, adminToken, {
      expectedVersion: archived.version,
      name: 'Changed',
    }).expect(409);
    const restored = adminCategorySchema.parse(
      (
        await call(
          'post',
          `/admin/categories/${category.id}/restore`,
          adminToken,
          { expectedVersion: archived.version },
        ).expect(200)
      ).body.data,
    );
    expect(restored).toMatchObject({ status: 'HIDDEN', version: 3 });
    await call('post', `/admin/categories/${category.id}/restore`, adminToken, {
      expectedVersion: 3,
    }).expect(409);
  });
  it('supports literal search, visibility filters, and stable pagination', async () => {
    await createCategory({ name: '100% Finance' });
    await createCategory({ name: '1000 Finance', status: 'HIDDEN' });
    const old = await createCategory({ name: 'Archive' });
    await archive(old);
    const defaultList = await call<AdminCategory[]>(
      'get',
      '/admin/categories?limit=1',
    ).expect(200);
    expect(defaultList.body.data).toHaveLength(1);
    expect(defaultList.body.meta.total).toBe(2);
    const literal = await call<AdminCategory[]>(
      'get',
      '/admin/categories?search=%25',
    ).expect(200);
    expect(literal.body.data.map((c) => c.name)).toEqual(['100% Finance']);
    const hidden = await call<AdminCategory[]>(
      'get',
      '/admin/categories?status=HIDDEN',
    ).expect(200);
    expect(hidden.body.meta.total).toBe(1);
    const all = await call<AdminCategory[]>(
      'get',
      '/admin/categories?status=all',
    ).expect(200);
    expect(all.body.meta.total).toBe(3);
  });
  it('returns only active safe category catalog fields without authentication', async () => {
    const active = await createCategory();
    await createCategory({ name: 'Hidden', status: 'HIDDEN' });
    const archived = await createCategory({ name: 'Archived' });
    await archive(archived);
    const response = await call<unknown[]>('get', '/categories', null).expect(
      200,
    );
    expect(
      response.body.data.map((c) => publicCategorySchema.parse(c)),
    ).toEqual([
      { id: active.id, name: active.name, description: active.description },
    ]);
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /subscriber|normalizedName|version/,
    );
  });
  it('makes concurrent subscription creation and repeated removal idempotent', async () => {
    const category = await createCategory();
    const responses = await Promise.all([
      call('put', `/me/category-subscriptions/${category.id}`, candidateToken),
      call('put', `/me/category-subscriptions/${category.id}`, candidateToken),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(
      categorySubscriptionSchema.parse(responses[0].body.data).subscribedAt,
    ).toBe(
      categorySubscriptionSchema.parse(responses[1].body.data).subscribedAt,
    );
    const detail = adminCategorySchema.parse(
      (await call('get', `/admin/categories/${category.id}`)).body.data,
    );
    expect(detail.subscriberCount).toBe(1);
    await call(
      'delete',
      `/me/category-subscriptions/${category.id}`,
      candidateToken,
    ).expect(204);
    await call(
      'delete',
      `/me/category-subscriptions/${category.id}`,
      candidateToken,
    ).expect(204);
    await call(
      'delete',
      `/me/category-subscriptions/${randomUUID()}`,
      candidateToken,
    ).expect(204);
  });
  it('retains hidden/archived subscriptions, blocks new subscriptions and permits unsubscribe', async () => {
    const category = await createCategory();
    await call(
      'put',
      `/me/category-subscriptions/${category.id}`,
      candidateToken,
    ).expect(200);
    const hidden = adminCategorySchema.parse(
      (
        await call('patch', `/admin/categories/${category.id}`, adminToken, {
          expectedVersion: 0,
          status: 'HIDDEN',
        }).expect(200)
      ).body.data,
    );
    await call(
      'put',
      `/me/category-subscriptions/${category.id}`,
      candidateToken,
    ).expect(404);
    await archive(hidden);
    const own = await call<unknown[]>(
      'get',
      '/me/category-subscriptions',
      candidateToken,
    ).expect(200);
    expect(
      categorySubscriptionSchema.parse(own.body.data[0]).category.status,
    ).toBe('ARCHIVED');
    const adminList = await call<unknown[]>(
      'get',
      `/admin/categories/${category.id}/subscribers`,
    ).expect(200);
    expect(
      categorySubscriberSchema.parse(adminList.body.data[0]),
    ).toMatchObject({ userId: candidateId, email: 'candidate@example.com' });
    expect(JSON.stringify(adminList.body)).not.toMatch(
      /password|token|secret|termAccepted/,
    );
    await call(
      'delete',
      `/me/category-subscriptions/${category.id}`,
      candidateToken,
    ).expect(204);
  });
  it('checks the current database role and isolates candidate subscriptions', async () => {
    const category = await createCategory();
    await call(
      'put',
      `/me/category-subscriptions/${category.id}`,
      candidateToken,
    ).expect(200);
    const second = await db.orm.public.User.create({
      email: 'second@example.com',
      role: 'TALENT',
      termAccepted: true,
    });
    const otherToken = jwt.sign({
      sub: second.id,
      email: second.email,
      role: 'TALENT',
    });
    expect(
      (
        await call<unknown[]>(
          'get',
          '/me/category-subscriptions',
          otherToken,
        ).expect(200)
      ).body.data,
    ).toEqual([]);
    await call(
      'delete',
      `/me/category-subscriptions/${category.id}`,
      otherToken,
    ).expect(204);
    expect(
      (await call('get', `/admin/categories/${category.id}`)).body.data,
    ).toMatchObject({ subscriberCount: 1 });
    await db.orm.public.User.where({ id: candidateId }).update({
      role: 'RECRUITER',
    });
    for (const method of ['get', 'put', 'delete'] as const)
      await call(
        method,
        `/me/category-subscriptions${method === 'get' ? '' : `/${category.id}`}`,
        candidateToken,
      ).expect(403);
    await call('get', '/me/category-subscriptions', adminToken).expect(403);
    await call('get', '/me/category-subscriptions', null).expect(401);
  });
  it('rejects invalid IDs, pagination, unknown fields and empty patches', async () => {
    const category = await createCategory();
    await call('post', '/admin/categories', adminToken, {
      name: 'New',
      status: 'ARCHIVED',
    }).expect(400);
    await call('patch', `/admin/categories/${category.id}`, adminToken, {
      expectedVersion: 0,
    }).expect(400);
    await call('post', '/admin/categories', adminToken, {
      name: 'New',
      version: 10,
    }).expect(400);
    await call('get', '/admin/categories?limit=101').expect(400);
    await call('get', '/categories?status=HIDDEN', null).expect(400);
    await call('get', '/admin/categories/not-a-uuid').expect(400);
    await call('get', `/admin/categories/${randomUUID()}/subscribers`).expect(
      404,
    );
    await call(
      'put',
      `/me/category-subscriptions/${randomUUID()}`,
      candidateToken,
    ).expect(404);
  });
});

describe('Category-aware job management and queue helpers', () => {
  it('assigns hidden categories and preserves omission while allowing explicit clearing', async () => {
    const category = await createCategory({ status: 'HIDDEN' });
    let job = await createJob({ categoryId: category.id });
    expect(job.categoryId).toBe(category.id);
    job = adminJobDetailSchema.parse(
      (
        await call('patch', `/admin/jobs/${job.id}`, adminToken, {
          expectedVersion: job.version,
          content: { title: 'Updated' },
        }).expect(200)
      ).body.data,
    );
    expect(job.categoryId).toBe(category.id);
    job = adminJobDetailSchema.parse(
      (
        await call('patch', `/admin/jobs/${job.id}`, adminToken, {
          expectedVersion: job.version,
          content: { categoryId: null },
        }).expect(200)
      ).body.data,
    );
    expect(job.categoryId).toBeNull();
    expect(
      (await call('get', `/admin/categories/${category.id}`)).body.data,
    ).toMatchObject({ assignedJobCount: 0 });
  });
  it('keeps archived assignments publishable and rejects explicit archived or missing targets', async () => {
    const category = await createCategory();
    const job = await createJob({ categoryId: category.id });
    await archive(category);
    await call('post', '/admin/jobs', adminToken, {
      ...content,
      categoryId: category.id,
    }).expect(409);
    await call('post', '/admin/jobs', adminToken, {
      ...content,
      categoryId: randomUUID(),
    }).expect(404);
    const published = adminJobDetailSchema.parse(
      (
        await call('post', `/admin/jobs/${job.id}/publish`, adminToken, {
          expectedVersion: job.version,
          content: { title: 'Published edit' },
        }).expect(200)
      ).body.data,
    );
    expect(published).toMatchObject({
      status: 'PUBLISHED',
      categoryId: category.id,
    });
    await call('patch', `/admin/jobs/${job.id}`, adminToken, {
      expectedVersion: published.version,
      content: { categoryId: category.id },
    }).expect(409);
    expect(
      (await call('get', `/admin/categories/${category.id}`)).body.data,
    ).toMatchObject({ assignedJobCount: 1 });
  });
  it('serializes category archival with concurrent assignment without losing existing job data', async () => {
    const category = await createCategory();
    const job = await createJob();
    const [archived, assigned] = await Promise.all([
      call('post', `/admin/categories/${category.id}/archive`, adminToken, {
        expectedVersion: category.version,
      }),
      call('patch', `/admin/jobs/${job.id}`, adminToken, {
        expectedVersion: job.version,
        content: { categoryId: category.id },
      }),
    ]);
    expect(archived.status).toBe(200);
    expect([200, 409]).toContain(assigned.status);
    const saved = adminJobDetailSchema.parse(
      (await call('get', `/admin/jobs/${job.id}`)).body.data,
    );
    expect(saved.categoryId).toBe(assigned.status === 200 ? category.id : null);
    expect(saved.title).toBe(content.title);
  });
  it('serializes category archival with concurrent subscription', async () => {
    const category = await createCategory();
    const [archived, subscribed] = await Promise.all([
      call('post', `/admin/categories/${category.id}/archive`, adminToken, {
        expectedVersion: 0,
      }),
      call('put', `/me/category-subscriptions/${category.id}`, candidateToken),
    ]);
    expect(archived.status).toBe(200);
    expect([200, 404]).toContain(subscribed.status);
    const own = await call<unknown[]>(
      'get',
      '/me/category-subscriptions',
      candidateToken,
    ).expect(200);
    expect(own.body.data).toHaveLength(subscribed.status === 200 ? 1 : 0);
  });
  it('leaves crawled jobs uncategorized and protects an admin assignment from recrawls', async () => {
    const repository = new IngestionRepository();
    const category = await createCategory();
    const payload = { ...content, externalId: 'source-one' };
    const imported = await repository.createPendingJob('source', payload);
    expect(imported.categoryId).toBeNull();
    await call('patch', `/admin/jobs/${imported.id}`, adminToken, {
      expectedVersion: 0,
      content: { categoryId: category.id },
    }).expect(200);
    expect(
      await repository.updatePendingJob(
        'source',
        { ...payload, title: 'Crawler overwrite' },
        1,
      ),
    ).toBeNull();
    expect(
      await db.orm.public.Job.where({ id: imported.id }).first(),
    ).toMatchObject({ categoryId: category.id, title: content.title });
  });
  it('returns filter-consistent summary/source counts through static routes', async () => {
    const category = await createCategory();
    const otherCategory = await createCategory({ name: 'Other' });
    const first = await createJob({ categoryId: category.id });
    await createJob({ categoryId: otherCategory.id, location: 'Mandalay' });
    await call('post', `/admin/jobs/${first.id}/publish`, adminToken, {
      expectedVersion: 0,
    }).expect(200);
    await new IngestionRepository().createPendingJob('myjobs', {
      ...content,
      externalId: 'one',
    });
    const filter = `categoryId=${category.id}&location=Yangon`;
    const summary = adminJobsSummarySchema.parse(
      (await call('get', `/admin/jobs/summary?${filter}`).expect(200)).body
        .data,
    );
    expect(summary).toEqual({
      total: 1,
      statusCounts: { PENDING: 0, PUBLISHED: 1, REJECTED: 0, CLOSED: 0 },
    });
    const sources = adminJobSourcesSchema.parse(
      (await call('get', '/admin/jobs/sources').expect(200)).body.data,
    );
    expect(sources).toEqual([
      { sourceId: 'manual', count: 2 },
      { sourceId: 'myjobs', count: 1 },
    ]);
    expect((await call('get', `/admin/jobs?${filter}`)).body.meta.total).toBe(
      summary.total,
    );
    const filteredSources = adminJobSourcesSchema.parse(
      (await call('get', `/admin/jobs/sources?${filter}`)).body.data,
    );
    expect(filteredSources).toEqual([{ sourceId: 'manual', count: 1 }]);
    await call('post', `/admin/jobs/${first.id}/close`, adminToken, {
      expectedVersion: 1,
    }).expect(200);
    await call('delete', `/admin/jobs/${first.id}`, adminToken, {
      expectedVersion: 2,
      note: 'Remove',
    }).expect(200);
    expect(
      adminJobsSummarySchema.parse(
        (await call('get', `/admin/jobs/summary?${filter}`)).body.data,
      ).total,
    ).toBe(0);
    expect(
      adminJobsSummarySchema.parse(
        (await call('get', `/admin/jobs/summary?${filter}&deletion=deleted`))
          .body.data,
      ).statusCounts.CLOSED,
    ).toBe(1);
  });
});

describe('Honest dashboard analytics', () => {
  it('returns zero-filled contemporary periods, current candidates and unavailable activity metrics', async () => {
    const response = await call(
      'get',
      '/admin/analytics/overview?period=7',
    ).expect(200);
    const data = adminAnalyticsOverviewSchema.parse(response.body.data);
    expect(data).toMatchObject({
      period: 7,
      timezone: 'Asia/Yangon',
      totalCandidates: 1,
      newCandidates: 1,
      jobsFirstPublished: 0,
    });
    expect(data.daily).toHaveLength(7);
    expect(data.daily.reduce((sum, d) => sum + d.newCandidates, 0)).toBe(1);
    for (const field of [
      'activeUsers',
      'jobViews',
      'applyClicks',
      'journeyRates',
    ] as const)
      expect(data[field]).toMatchObject({ available: false, value: null });
    expect(
      (await call('get', '/admin/analytics/overview').expect(200)).body.data,
    ).toMatchObject({ period: 30 });
    expect(
      adminAnalyticsOverviewSchema.parse(
        (await call('get', '/admin/analytics/overview?period=90').expect(200))
          .body.data,
      ).daily,
    ).toHaveLength(90);
    await call('get', '/admin/analytics/overview?period=8').expect(400);
    await call('get', '/admin/analytics/overview?segment=premium').expect(400);
  });
  it('counts first publications regardless of current lifecycle/deletion and excludes future timestamps', async () => {
    const stamp = new Date(Date.now() - 60000).toISOString();
    await seededJob({ publishedAt: stamp });
    await seededJob({ publishedAt: stamp, status: 'CLOSED' });
    await seededJob({
      publishedAt: stamp,
      status: 'REJECTED',
      deletedAt: stamp,
    });
    await seededJob({
      publishedAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const data = adminAnalyticsOverviewSchema.parse(
      (await call('get', '/admin/analytics/overview?period=7').expect(200)).body
        .data,
    );
    expect(data.jobsFirstPublished).toBe(3);
    expect(data.daily.reduce((sum, d) => sum + d.jobsFirstPublished, 0)).toBe(
      3,
    );
  });
  it('uses current TALENT membership rather than registration method or stale role claims', async () => {
    await db.orm.public.User.create({
      email: 'recruiter@example.com',
      role: 'RECRUITER',
      termAccepted: true,
    });
    await db.orm.public.User.create({
      email: 'google@example.com',
      role: 'TALENT',
      signUpMethod: 'GOOGLE',
      termAccepted: true,
    });
    let data = adminAnalyticsOverviewSchema.parse(
      (await call('get', '/admin/analytics/overview?period=7')).body.data,
    );
    expect(data.totalCandidates).toBe(2);
    await db.orm.public.User.where({ id: candidateId }).update({
      role: 'ADMIN',
    });
    data = adminAnalyticsOverviewSchema.parse(
      (await call('get', '/admin/analytics/overview?period=7')).body.data,
    );
    expect(data.totalCandidates).toBe(1);
    expect(data.newCandidates).toBe(1);
  });
  it('respects the exact Yangon start boundary and excludes the reporting end', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date());
    try {
      const service = app.get(AdminAnalyticsService);
      const initial = await service.overview({ period: 7 });
      await pool.query('UPDATE public."user" SET "createdAt"=$1 WHERE id=$2', [
        new Date(Date.parse(initial.from) - 1).toISOString(),
        candidateId,
      ]);
      await db.orm.public.User.create({
        email: 'boundary@example.com',
        role: 'TALENT',
        termAccepted: true,
        createdAt: initial.from,
      });
      await db.orm.public.User.create({
        email: 'end@example.com',
        role: 'TALENT',
        termAccepted: true,
        createdAt: initial.to,
      });
      await seededJob({ publishedAt: initial.from });
      await seededJob({ publishedAt: initial.to });
      await seededJob({
        publishedAt: new Date(Date.parse(initial.from) - 1).toISOString(),
      });
      const data = await service.overview({ period: 7 });
      expect(data.newCandidates).toBe(1);
      expect(data.jobsFirstPublished).toBe(1);
      expect(data.daily[0]).toMatchObject({
        newCandidates: 1,
        jobsFirstPublished: 1,
      });
      await db.orm.public.User.where({ role: 'TALENT' }).updateAndCount({
        role: 'RECRUITER',
      });
      const empty = await service.overview({ period: 7 });
      expect(empty.totalCandidates).toBe(0);
      expect(empty.daily.every((d) => d.newCandidates === 0)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not recount publication after reopen and republish', async () => {
    const job = await createJob();
    await call('post', `/admin/jobs/${job.id}/publish`, adminToken, {
      expectedVersion: 0,
    }).expect(200);
    const old = '2020-01-01T00:00:00.000Z';
    await db.orm.public.Job.where({ id: job.id }).update({ publishedAt: old });
    await call('post', `/admin/jobs/${job.id}/close`, adminToken, {
      expectedVersion: 1,
    }).expect(200);
    await call('post', `/admin/jobs/${job.id}/reopen`, adminToken, {
      expectedVersion: 2,
    }).expect(200);
    const republished = adminJobDetailSchema.parse(
      (
        await call('post', `/admin/jobs/${job.id}/publish`, adminToken, {
          expectedVersion: 3,
        }).expect(200)
      ).body.data,
    );
    expect(new Date(republished.publishedAt!).toISOString()).toBe(old);
    expect(
      adminAnalyticsOverviewSchema.parse(
        (await call('get', '/admin/analytics/overview?period=90')).body.data,
      ).jobsFirstPublished,
    ).toBe(0);
  });
  it('documents new request and response contracts in Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    applyZodSchemasToSwagger(document, app.get(ModulesContainer));
    for (const path of [
      '/admin/categories',
      '/categories',
      '/me/category-subscriptions',
      '/admin/jobs/summary',
      '/admin/jobs/sources',
      '/admin/analytics/overview',
    ])
      expect(document.paths[`${base}${path}`]).toBeTruthy();
    expect(document.components?.schemas?.CreateCategoryDto).toBeTruthy();
    expect(
      document.paths[`${base}/admin/analytics/overview`].get?.responses['200'],
    ).toBeTruthy();
  });
});
