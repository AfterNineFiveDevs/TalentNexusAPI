import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { Server } from 'node:http';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { VersioningType, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Transport } from '@nestjs/microservices';
import {
  credentials,
  loadPackageDefinition,
  Metadata,
  type Client,
  type ServiceError,
  type ClientUnaryCall,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import pg from 'pg';
import request from 'supertest';
import {
  crawlerSourceSchema,
  crawlerRunSchema,
  type CrawlerClaim,
} from '@talent-nexus/contracts';
import { AppModule } from '../src/app.module';
import { CrawlerControlService } from '../src/crawler-control/crawler.service';
import { WorkerIngestionService } from '../src/ingestion/worker-ingestion.service';
import { configureApiResponseHandling } from '../src/common/http/configure-api-response-handling';
import { db } from '../src/prisma/db';

const url = process.env.ADMIN_JOBS_TEST_DATABASE_URL;
if (
  !url ||
  url !== process.env.DATABASE_URL ||
  new URL(url).hostname !== '127.0.0.1' ||
  new URL(url).pathname !== '/admin_jobs_fixture'
)
  throw new Error('Disposable fixture DB required');
const pool = new pg.Pool({ connectionString: url });
let app: INestApplication<Server>;
let control: CrawlerControlService;
let ingestion: WorkerIngestionService;
let adminToken: string;
let jwt: JwtService;
let client: Client &
  Record<
    string,
    (
      r: object,
      m: Metadata,
      cb: (
        e: ServiceError | null,
        r: { payloadJson?: string; received?: number },
      ) => void,
    ) => ClientUnaryCall
  >;
const base = '/api/v1/admin/crawler/sources';
const wire = (response: request.Response) =>
  z
    .object({
      data: z.unknown(),
      meta: z.object({ total: z.number() }).optional(),
    })
    .parse(response.body);
const identity = { workerId: 'worker-fixture', sourceIds: ['myjobs' as const] };
const job = {
  externalId: 'stable-fixture',
  sourceUrl: 'https://myjobs.com.mm/jobs/fixture',
  title: 'Accountant',
  companyName: 'Fixture',
  location: 'Yangon',
  description: 'Fixture description',
  applicationUrl: [],
};
async function claim() {
  await control.manual('myjobs');
  return (await control.claim(identity)) as CrawlerClaim;
}
const batch = (run: CrawlerClaim, jobs = [job]) => ({
  sourceId: 'myjobs',
  runId: run.runId,
  leaseToken: run.leaseToken,
  batchId: randomUUID(),
  jobs,
});
const done = (run: CrawlerClaim) =>
  control.complete(identity, run.runId, run.leaseToken, {
    outcome: 'SUCCEEDED',
    listings: 1,
    enriched: 1,
    failed: 0,
    failures: [],
  });
function rpc(method: string, payload: object, authenticated = true) {
  const metadata = new Metadata();
  if (authenticated)
    metadata.set('authorization', `Bearer ${process.env.CRAWLER_WORKER_TOKEN}`);
  metadata.set('x-worker-id', identity.workerId);
  return new Promise<{ payloadJson?: string; received?: number }>(
    (resolve, reject) =>
      client[method](payload, metadata, (error, response) =>
        error ? reject(error) : resolve(response),
      ),
  );
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
  const reserve = createServer();
  await new Promise<void>((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((resolve) => reserve.close(() => resolve()));
  const protoPath = fileURLToPath(
    import.meta
      .resolve('@talent-nexus/contracts/proto/ingestion/v1/job-ingestion.proto'),
  );
  app.connectMicroservice(
    {
      transport: Transport.GRPC,
      options: {
        package: 'talentnexus.ingestion.v1',
        protoPath,
        url: `127.0.0.1:${port}`,
        loader: { arrays: true },
      },
    },
    { inheritAppConfig: true },
  );
  await app.init();
  await app.startAllMicroservices();
  const definition = loadPackageDefinition(
    loadSync(protoPath, { arrays: true }),
  ) as unknown as {
    talentnexus: {
      ingestion: {
        v1: {
          JobIngestionService: new (
            url: string,
            c: ReturnType<typeof credentials.createInsecure>,
          ) => typeof client;
        };
      };
    };
  };
  client = new definition.talentnexus.ingestion.v1.JobIngestionService(
    `127.0.0.1:${port}`,
    credentials.createInsecure(),
  );
  control = app.get(CrawlerControlService);
  ingestion = app.get(WorkerIngestionService);
  jwt = app.get(JwtService);
});
beforeEach(async () => {
  await pool.query(
    'TRUNCATE public."crawlerSource",public."crawlerWorker",public.job,public."user" CASCADE',
  );
  const id = randomUUID(),
    sid = randomUUID();
  await db.orm.public.User.create({
    id,
    email: 'crawler-admin@example.com',
    role: 'ADMIN',
    termAccepted: true,
  });
  await db.orm.public.AdminMembership.create({
    userId: id,
    state: 'ACTIVE',
    secretCiphertext: 'fixture-only',
  });
  await db.orm.public.AuthSession.create({
    id: sid,
    userId: id,
    purpose: 'ADMIN',
    refreshTokenHash: randomUUID(),
    mfaVerifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  adminToken = jwt.sign({
    sub: id,
    email: 'crawler-admin@example.com',
    role: 'ADMIN',
    sid,
    aud: 'talentnexus-admin',
    amr: ['pwd', 'mfa'],
  });
});
afterAll(async () => {
  client?.close();
  await app?.close();
  await db.close();
  await pool.end();
});
it('guards all admin routes for unauthenticated, candidate and recruiter callers', async () => {
  for (const [method, path] of [
    ['get', ''],
    ['get', '/myjobs'],
    ['patch', '/myjobs'],
    ['post', '/myjobs/run'],
    ['get', '/myjobs/runs'],
    ['get', `/myjobs/runs/${randomUUID()}`],
  ] as const) {
    await request(app.getHttpServer())
      [method](base + path)
      .expect(401);
    for (const role of ['TALENT', 'RECRUITER'])
      await request(app.getHttpServer())
        [method](base + path)
        .auth(
          jwt.sign({ sub: randomUUID(), email: 'nobody@example.com', role }),
          { type: 'bearer' },
        )
        .expect(403);
  }
});
it('returns source contracts, validates updates and rejects stale versions', async () => {
  const source = await request(app.getHttpServer())
    .get(base + '/myjobs')
    .auth(adminToken, { type: 'bearer' })
    .expect(200);
  expect(crawlerSourceSchema.parse(wire(source).data).enabled).toBe(false);
  const changed = await request(app.getHttpServer())
    .patch(base + '/myjobs')
    .auth(adminToken, { type: 'bearer' })
    .send({
      expectedVersion: 0,
      enabled: true,
      schedule: { kind: 'interval', hours: 6 },
    })
    .expect(200);
  expect(crawlerSourceSchema.parse(wire(changed).data).version).toBe(1);
  expect(crawlerSourceSchema.parse(wire(changed).data).nextDueAt).toBeTruthy();
  await request(app.getHttpServer())
    .patch(base + '/myjobs')
    .auth(adminToken, { type: 'bearer' })
    .send({ expectedVersion: 0, pageLimit: 3 })
    .expect(409);
  await request(app.getHttpServer())
    .patch(base + '/myjobs')
    .auth(adminToken, { type: 'bearer' })
    .send({ expectedVersion: 1, pageLimit: 101 })
    .expect(400);
});
it('allows a manual paused run, prevents duplicates and returns paginated history', async () => {
  const response = await request(app.getHttpServer())
    .post(base + '/myjobs/run')
    .auth(adminToken, { type: 'bearer' })
    .expect(202);
  const run = crawlerRunSchema.parse(wire(response).data);
  expect(run.trigger).toBe('MANUAL');
  await request(app.getHttpServer())
    .post(base + '/myjobs/run')
    .auth(adminToken, { type: 'bearer' })
    .expect(409);
  const list = await request(app.getHttpServer())
    .get(base + '/myjobs/runs?page=2&limit=1')
    .auth(adminToken, { type: 'bearer' })
    .expect(200);
  expect(wire(list).meta?.total).toBe(1);
  expect(wire(list).data).toEqual([]);
  await request(app.getHttpServer())
    .get(base + `/myjobs/runs/${run.id}`)
    .auth(adminToken, { type: 'bearer' })
    .expect(200);
  await request(app.getHttpServer())
    .get(base + `/myjobs/runs/${randomUUID()}`)
    .auth(adminToken, { type: 'bearer' })
    .expect(404);
});
it('claims once across competing workers and exposes worker heartbeats', async () => {
  await control.manual('myjobs');
  const claims = await Promise.all([
    control.claim(identity),
    control.claim({ ...identity, workerId: 'other-worker' }),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect((await control.detail('myjobs')).workerAvailable).toBe(true);
});
it('creates one catch-up and retains the interval anchor after downtime', async () => {
  await control.update('myjobs', {
    expectedVersion: 0,
    enabled: true,
    schedule: { kind: 'interval', hours: 6 },
  });
  const anchor = new Date(Date.now() - 49 * 3600000);
  await db.orm.public.CrawlerSource.where({ sourceId: 'myjobs' }).update({
    nextDueAt: anchor.toISOString(),
  });
  expect(await control.claim(identity)).toBeTruthy();
  expect(await control.claim(identity)).toBeNull();
  const source = await control.detail('myjobs');
  expect(
    (new Date(source.nextDueAt!).getTime() - anchor.getTime()) % (6 * 3600000),
  ).toBe(0);
  const { total } = await db.orm.public.CrawlerRun.aggregate((a) => ({
    total: a.count(),
  }));
  expect(total).toBe(1);
});
it('pause prevents new work and lets active work finish', async () => {
  const run = await claim();
  await control.update('myjobs', { expectedVersion: 0, enabled: false });
  await ingestion.ingest(identity, batch(run));
  await done(run);
  expect(await control.claim(identity)).toBeNull();
});
it('abandons expired leases and rejects stale ingestion and completion', async () => {
  const run = await claim();
  await db.orm.public.CrawlerRun.where({ id: run.runId }).update({
    leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  await expect(ingestion.ingest(identity, batch(run))).rejects.toThrow();
  await expect(done(run)).rejects.toThrow();
  await control.detail('myjobs');
  expect((await control.run('myjobs', run.runId)).status).toBe('ABANDONED');
  expect(await claim()).toBeTruthy();
});
it('deduplicates committed batches after response loss and rejects changed payload reuse', async () => {
  const run = await claim(),
    payload = batch(run);
  const first = await ingestion.ingest(identity, payload);
  expect(first).toEqual({ received: 1, created: 1, updated: 0, observed: 0 });
  expect(await ingestion.ingest(identity, payload)).toEqual(first);
  await expect(
    ingestion.ingest(identity, {
      ...payload,
      jobs: [{ ...job, title: 'Changed' }],
    }),
  ).rejects.toThrow();
  expect((await control.run('myjobs', run.runId)).counts.received).toBe(1);
  await done(run);
});
it('rejects invalid batches before writes and source impersonation', async () => {
  const run = await claim();
  await expect(
    ingestion.ingest(
      identity,
      batch(run, [
        job,
        { ...job, externalId: 'bad', sourceUrl: 'javascript:alert(1)' },
      ]),
    ),
  ).rejects.toThrow();
  await expect(
    ingestion.ingest(identity, { ...batch(run), sourceId: 'manual' }),
  ).rejects.toThrow();
  expect(await db.orm.public.Job.first()).toBeNull();
});
it('rolls back a batch if a database operation fails mid-batch', async () => {
  const run = await claim();
  await pool.query(
    `CREATE FUNCTION crawler_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."externalId"='explode' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER crawler_fixture_failure BEFORE INSERT ON public.job FOR EACH ROW EXECUTE FUNCTION crawler_fixture_failure()`,
  );
  try {
    await expect(
      ingestion.ingest(
        identity,
        batch(run, [job, { ...job, externalId: 'explode' }]),
      ),
    ).rejects.toThrow();
    expect(await db.orm.public.Job.first()).toBeNull();
    expect(await db.orm.public.CrawlerBatch.first()).toBeNull();
  } finally {
    await pool.query(
      'DROP TRIGGER crawler_fixture_failure ON public.job; DROP FUNCTION crawler_fixture_failure()',
    );
  }
});
it('preserves protected content and increments versions only for actual content changes', async () => {
  const run = await claim();
  await ingestion.ingest(identity, batch(run));
  await ingestion.ingest(identity, batch(run));
  expect((await db.orm.public.Job.first())?.version).toBe(0);
  await ingestion.ingest(identity, batch(run, [{ ...job, title: 'Changed' }]));
  expect((await db.orm.public.Job.first())?.version).toBe(1);
  await db.orm.public.Job.where({ sourceId: 'myjobs' }).update({
    adminEditedAt: new Date().toISOString(),
    deletedAt: new Date().toISOString(),
    title: 'Admin',
  });
  const response = await ingestion.ingest(identity, batch(run));
  expect(response.observed).toBe(1);
  expect((await db.orm.public.Job.first())?.title).toBe('Admin');
});
it('serves the actual gRPC contract and rejects missing credentials', async () => {
  await expect(rpc('claimWork', identity, false)).rejects.toMatchObject({
    code: 16,
  });
  await control.manual('myjobs');
  const response = await rpc('claimWork', identity);
  const run = JSON.parse(response.payloadJson!) as CrawlerClaim;
  expect(run.sourceId).toBe('myjobs');
  await expect(
    rpc('renewLease', { ...identity, ...run }),
  ).resolves.toBeTruthy();
  expect((await rpc('ingestJobs', batch(run))).received).toBe(1);
  await rpc('completeRun', {
    ...identity,
    ...run,
    payloadJson: JSON.stringify({
      outcome: 'SUCCEEDED',
      listings: 1,
      enriched: 1,
      failed: 0,
      failures: [],
    }),
  });
  expect((await control.run('myjobs', run.runId)).status).toBe('SUCCEEDED');
});

it('resumes an overdue paused schedule with one catch-up', async () => {
  await control.update('myjobs', {
    expectedVersion: 0,
    enabled: true,
    schedule: { kind: 'interval', hours: 6 },
  });
  const overdue = new Date(Date.now() - 30 * 3600000).toISOString();
  await db.orm.public.CrawlerSource.where({ sourceId: 'myjobs' }).update({
    nextDueAt: overdue,
  });
  await control.update('myjobs', { expectedVersion: 1, enabled: false });
  expect(await control.claim(identity)).toBeNull();
  await control.update('myjobs', { expectedVersion: 2, enabled: true });
  expect(await control.claim(identity)).toBeTruthy();
  expect(await control.claim(identity)).toBeNull();
});
it('renews live ownership, expires worker availability and fences absolute deadlines', async () => {
  const run = await claim();
  await expect(
    control.renew(identity, run.runId, run.leaseToken),
  ).resolves.toEqual({ renewed: true });
  await db.orm.public.CrawlerWorker.where({
    workerId: identity.workerId,
  }).update({ lastSeenAt: new Date(Date.now() - 100000).toISOString() });
  expect((await control.detail('myjobs')).workerAvailable).toBe(false);
  await db.orm.public.CrawlerRun.where({ id: run.runId }).update({
    deadlineAt: new Date(Date.now() - 1000).toISOString(),
  });
  await expect(
    control.renew(identity, run.runId, run.leaseToken),
  ).rejects.toThrow();
  await expect(ingestion.ingest(identity, batch(run))).rejects.toThrow();
});
it('serializes concurrent first inserts and returns observation counts', async () => {
  const run = await claim();
  const results = await Promise.all([
    ingestion.ingest(identity, batch(run)),
    ingestion.ingest(identity, batch(run)),
  ]);
  expect(results.reduce((sum, row) => sum + (row.created ?? 0), 0)).toBe(1);
  expect(results.reduce((sum, row) => sum + (row.observed ?? 0), 0)).toBe(1);
  const { total } = await db.orm.public.Job.aggregate((a) => ({
    total: a.count(),
  }));
  expect(total).toBe(1);
});
it('stores partial outcomes without exposing lease tokens', async () => {
  const run = await claim();
  await ingestion.ingest(identity, batch(run));
  await control.complete(identity, run.runId, run.leaseToken, {
    outcome: 'PARTIAL',
    listings: 2,
    enriched: 1,
    failed: 1,
    failures: [{ url: 'https://myjobs.com.mm/jobs/broken', reason: 'PARSE' }],
  });
  const history = await control.run('myjobs', run.runId);
  expect(crawlerRunSchema.parse(history).status).toBe('PARTIAL');
  expect(JSON.stringify(history)).not.toContain(run.leaseToken);
  expect(history.counts.received).toBe(1);
});
it('rejects extra manual-run fields, bad pagination and wrong run ownership', async () => {
  await request(app.getHttpServer())
    .post(base + '/myjobs/run')
    .auth(adminToken, { type: 'bearer' })
    .send({ sourceUrl: 'https://arbitrary.example.com' })
    .expect(400);
  await request(app.getHttpServer())
    .get(base + '/myjobs/runs?limit=101')
    .auth(adminToken, { type: 'bearer' })
    .expect(400);
  const run = await claim();
  await expect(
    control.renew(
      { ...identity, workerId: 'impostor' },
      run.runId,
      run.leaseToken,
    ),
  ).rejects.toThrow();
});
