import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  crawlerCompletionSchema,
  crawlerScheduleSchema,
  type CrawlerPagination,
  type UpdateCrawlerSource,
} from '@talent-nexus/contracts';
import { paginated } from '../common/http/api-response.factory';
import {
  CrawlerRepository,
  type CrawlerStore,
  type CrawlerRunRow,
} from './crawler.repository';
import { nextOccurrence } from './schedule';

export const emptyCounts = () => ({
  listings: 0,
  enriched: 0,
  failed: 0,
  received: 0,
  created: 0,
  updated: 0,
  observed: 0,
});
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const iso = (value: string | null) =>
  value === null ? null : new Date(value).toISOString();
export function rpcError(code: number, message: string): never {
  throw new RpcException({ code, message });
}
const workerSchema = z.object({
  workerId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[\w.-]+$/),
  sourceIds: z.array(z.literal('myjobs')).min(1).max(1),
});
export type WorkerIdentity = z.infer<typeof workerSchema>;
type RunRow = CrawlerRunRow;
@Injectable()
export class CrawlerControlService {
  constructor(
    private readonly repository: CrawlerRepository,
    private readonly config: ConfigService,
  ) {}
  private async initialize(orm: CrawlerStore) {
    if (!(await orm.source('myjobs')))
      await orm.createSource(
        'myjobs',
        JSON.stringify({
          kind: 'weekly',
          weekdays: [1, 4],
          time: '09:00',
        }),
      );
  }
  private async source(orm: CrawlerStore, sourceId: string) {
    const row = await orm.source(sourceId);
    if (!row) throw new NotFoundException('Crawler source not found');
    return row;
  }
  private presentRun(run: RunRow) {
    return {
      id: run.id,
      sourceId: run.sourceId,
      trigger: run.trigger,
      status: run.status,
      queuedAt: iso(run.queuedAt),
      startedAt: iso(run.startedAt),
      finishedAt: iso(run.finishedAt),
      counts: JSON.parse(run.counts) as ReturnType<typeof emptyCounts>,
      failures: JSON.parse(run.failures) as unknown[],
      configuration: JSON.parse(run.configuration) as unknown,
    };
  }
  private async presentSource(orm: CrawlerStore, sourceId: string, now: Date) {
    const row = await this.source(orm, sourceId);
    const latest = await orm.latestRun(sourceId);
    const workers = await orm.availableWorkers(
      new Date(now.getTime() - 90_000).toISOString(),
    );
    return {
      ...row,
      schedule: JSON.parse(row.schedule) as unknown,
      nextDueAt: iso(row.nextDueAt),
      latestOutcome: latest?.status ?? null,
      workerAvailable: workers.some((w) =>
        (JSON.parse(w.sourceIds) as string[]).includes(sourceId),
      ),
    };
  }
  list() {
    return this.repository.transaction(async (orm, now) => {
      await this.initialize(orm);
      await this.reap(orm, now);
      return [await this.presentSource(orm, 'myjobs', now)];
    });
  }
  detail(sourceId: string) {
    return this.repository.transaction(async (orm, now) => {
      await this.initialize(orm);
      await this.reap(orm, now);
      return this.presentSource(orm, sourceId, now);
    });
  }
  update(sourceId: string, input: UpdateCrawlerSource) {
    return this.repository.transaction(async (orm, now) => {
      await this.initialize(orm);
      const current = await this.source(orm, sourceId);
      if (current.version !== input.expectedVersion)
        throw new ConflictException('Stale crawler configuration');
      const { expectedVersion, schedule, ...changes } = input;
      const timezone = input.timezone ?? current.timezone;
      let nextDueAt = current.nextDueAt;
      if (
        schedule ||
        input.timezone !== undefined ||
        (!nextDueAt && input.enabled)
      )
        nextDueAt = nextOccurrence(
          schedule ?? crawlerScheduleSchema.parse(JSON.parse(current.schedule)),
          timezone,
          now,
        ).toISOString();
      await orm.updateSource(
        sourceId,
        {
          ...changes,
          ...(schedule ? { schedule: JSON.stringify(schedule) } : {}),
          nextDueAt,
          version: expectedVersion + 1,
        },
        expectedVersion,
      );
      // Paused schedules do not retain queued scheduled work. Active work finishes.
      if (input.enabled === false)
        for (const run of await orm.queuedScheduled(sourceId))
          await orm.updateRun(run.id, {
            status: 'ABANDONED',
            finishedAt: now.toISOString(),
          });
      return this.presentSource(orm, sourceId, now);
    });
  }
  private async enqueue(
    orm: CrawlerStore,
    sourceId: string,
    trigger: string,
    dueAt: Date,
  ) {
    const source = await this.source(orm, sourceId);
    return orm.createRun({
      sourceId,
      trigger,
      status: 'QUEUED',
      queuedAt: dueAt.toISOString(),
      counts: JSON.stringify(emptyCounts()),
      configuration: JSON.stringify({
        schedule: JSON.parse(source.schedule) as unknown,
        timezone: source.timezone,
        pageLimit: source.pageLimit,
      }),
    });
  }
  private async active(orm: CrawlerStore, sourceId: string) {
    return orm.activeRun(sourceId);
  }
  async reap(orm: CrawlerStore, now: Date) {
    const runs = await orm.runningRuns();
    for (const run of runs)
      if (
        !run.leaseExpiresAt ||
        new Date(run.leaseExpiresAt) <= now ||
        !run.deadlineAt ||
        new Date(run.deadlineAt) <= now
      )
        await orm.updateRun(
          run.id,
          {
            status: 'ABANDONED',
            finishedAt: now.toISOString(),
            leaseHash: null,
          },
          'RUNNING',
        );
  }
  manual(sourceId: string) {
    return this.repository.transaction(async (orm, now) => {
      await this.initialize(orm);
      await this.source(orm, sourceId);
      await this.reap(orm, now);
      if (await this.active(orm, sourceId))
        throw new ConflictException('Source already queued or running');
      return this.presentRun(await this.enqueue(orm, sourceId, 'MANUAL', now));
    });
  }
  runs(sourceId: string, query: CrawlerPagination) {
    return this.repository.transaction(async (orm, now) => {
      await this.initialize(orm);
      await this.source(orm, sourceId);
      await this.reap(orm, now);
      const { rows, total } = await orm.listRuns(
        sourceId,
        query.page,
        query.limit,
      );
      const totalPages = Math.ceil(total / query.limit);
      return paginated(
        rows.map((r) => this.presentRun(r)),
        {
          ...query,
          total,
          totalPages,
          hasNextPage: query.page < totalPages,
          hasPreviousPage: query.page > 1,
        },
      );
    });
  }
  run(sourceId: string, id: string) {
    return this.repository.transaction(async (orm, now) => {
      await this.reap(orm, now);
      const run = await orm.run(id, sourceId);
      if (!run) throw new NotFoundException('Crawler run not found');
      return this.presentRun(run);
    });
  }
  identity(input: unknown): WorkerIdentity {
    const parsed = workerSchema.safeParse(input);
    if (!parsed.success)
      rpcError(status.INVALID_ARGUMENT, 'Invalid worker identity');
    return parsed.data;
  }
  private async heartbeat(
    orm: CrawlerStore,
    identity: WorkerIdentity,
    now: Date,
  ) {
    await orm.heartbeat(identity.workerId, identity.sourceIds, now);
  }
  claim(identity: WorkerIdentity) {
    return this.repository.transaction(async (orm, now) => {
      await this.initialize(orm);
      await this.reap(orm, now);
      await this.heartbeat(orm, identity, now);
      // One global active run in this first release, even during a rolling deployment.
      if (await orm.activeRun()) return null;
      for (const sourceId of identity.sourceIds) {
        const source = await this.source(orm, sourceId);
        if (
          source.enabled &&
          source.nextDueAt &&
          new Date(source.nextDueAt) <= now &&
          !(await this.active(orm, sourceId))
        )
          await this.enqueue(
            orm,
            sourceId,
            'SCHEDULED',
            new Date(source.nextDueAt),
          );
      }
      const run = await orm.queuedRun(identity.sourceIds);
      if (!run) return null;
      const source = await this.source(orm, run.sourceId);
      if (source.nextDueAt && new Date(source.nextDueAt) <= now) {
        const schedule = crawlerScheduleSchema.parse(
          JSON.parse(source.schedule),
        );
        let next: Date;
        if (schedule.kind === 'interval') {
          const anchor = new Date(source.nextDueAt).getTime();
          const step = schedule.hours * 3_600_000;
          next = new Date(
            anchor + (Math.floor((now.getTime() - anchor) / step) + 1) * step,
          );
        } else next = nextOccurrence(schedule, source.timezone, now);
        await orm.updateSource(source.sourceId, {
          nextDueAt: next.toISOString(),
        });
      }
      const leaseToken = randomBytes(32).toString('hex');
      const deadlineAt = new Date(
        now.getTime() +
          this.config.get<number>('CRAWLER_RUN_TIMEOUT_MS', 1_800_000),
      ).toISOString();
      await orm.updateRun(
        run.id,
        {
          status: 'RUNNING',
          workerId: identity.workerId,
          leaseHash: hash(leaseToken),
          leaseExpiresAt: new Date(now.getTime() + 90_000).toISOString(),
          startedAt: now.toISOString(),
          deadlineAt,
        },
        'QUEUED',
      );
      return {
        runId: run.id,
        sourceId: run.sourceId,
        leaseToken,
        pageLimit: (JSON.parse(run.configuration) as { pageLimit: number })
          .pageLimit,
        deadlineAt,
      };
    });
  }
  async owned(
    orm: CrawlerStore,
    now: Date,
    identity: WorkerIdentity,
    id: string,
    token: string,
  ) {
    if (!z.uuid().safeParse(id).success || !/^[a-f0-9]{64}$/.test(token))
      rpcError(status.INVALID_ARGUMENT, 'Invalid run credentials');
    const run = await orm.run(id);
    if (
      !run ||
      run.status !== 'RUNNING' ||
      run.workerId !== identity.workerId ||
      !identity.sourceIds.includes(run.sourceId as 'myjobs') ||
      run.leaseHash !== hash(token) ||
      !run.leaseExpiresAt ||
      new Date(run.leaseExpiresAt) <= now ||
      !run.deadlineAt ||
      new Date(run.deadlineAt) <= now
    )
      rpcError(status.FAILED_PRECONDITION, 'Run ownership lost');
    return run;
  }
  renew(identity: WorkerIdentity, id: string, token: string) {
    return this.repository.transaction(async (orm, now) => {
      await this.owned(orm, now, identity, id, token);
      await this.heartbeat(orm, identity, now);
      await orm.updateRun(id, {
        leaseExpiresAt: new Date(now.getTime() + 90_000).toISOString(),
      });
      return { renewed: true };
    });
  }
  complete(
    identity: WorkerIdentity,
    id: string,
    token: string,
    input: unknown,
  ) {
    const parsed = crawlerCompletionSchema.safeParse(input);
    if (!parsed.success)
      rpcError(status.INVALID_ARGUMENT, 'Invalid completion');
    return this.repository.transaction(async (orm, now) => {
      const run = await this.owned(orm, now, identity, id, token);
      const { outcome, failures, ...counts } = parsed.data;
      const previous = JSON.parse(run.counts) as ReturnType<typeof emptyCounts>;
      if (
        outcome === 'SUCCEEDED' &&
        (counts.failed > 0 || counts.enriched !== previous.received)
      )
        rpcError(
          status.INVALID_ARGUMENT,
          'Successful run has incomplete ingestion',
        );
      await orm.updateRun(id, {
        status: outcome,
        finishedAt: now.toISOString(),
        leaseHash: null,
        counts: JSON.stringify({ ...previous, ...counts }),
        failures: JSON.stringify(failures),
      });
      return { completed: true };
    });
  }
}
