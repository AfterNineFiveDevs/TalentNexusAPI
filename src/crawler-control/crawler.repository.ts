import { Injectable } from '@nestjs/common';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Models } from '../prisma/contract';
import { db } from '../prisma/db';

export type CrawlerOrm = typeof db.orm.public;
export type CrawlerRunRow = Scalars<Models.public_CrawlerRun>;
type SourceRow = Scalars<Models.public_CrawlerSource>;
export class CrawlerStore {
  constructor(readonly orm: CrawlerOrm) {}
  source(sourceId: string) {
    return this.orm.CrawlerSource.where({ sourceId }).first();
  }
  createSource(sourceId: string, schedule: string) {
    return this.orm.CrawlerSource.create({ sourceId, schedule });
  }
  updateSource(
    sourceId: string,
    changes: Partial<SourceRow>,
    version?: number,
  ) {
    let rows = this.orm.CrawlerSource.where({ sourceId });
    if (version !== undefined) rows = rows.where({ version });
    return rows.update(changes);
  }
  latestRun(sourceId: string) {
    return this.orm.CrawlerRun.where({ sourceId })
      .orderBy([(r) => r.queuedAt.desc(), (r) => r.id.desc()])
      .first();
  }
  availableWorkers(after: string) {
    return this.orm.CrawlerWorker.where((w) => w.lastSeenAt.gt(after)).all();
  }
  queuedScheduled(sourceId: string) {
    return this.orm.CrawlerRun.where({
      sourceId,
      status: 'QUEUED',
      trigger: 'SCHEDULED',
    }).all();
  }
  createRun(
    input: Pick<
      CrawlerRunRow,
      | 'sourceId'
      | 'trigger'
      | 'status'
      | 'queuedAt'
      | 'counts'
      | 'configuration'
    >,
  ) {
    return this.orm.CrawlerRun.create(input);
  }
  updateRun(id: string, changes: Partial<CrawlerRunRow>, status?: string) {
    let rows = this.orm.CrawlerRun.where({ id });
    if (status) rows = rows.where({ status });
    return rows.update(changes);
  }
  activeRun(sourceId?: string) {
    let rows = this.orm.CrawlerRun.where((r) =>
      r.status.in(['QUEUED', 'RUNNING']),
    );
    if (sourceId) rows = rows.where({ sourceId });
    else rows = rows.where({ status: 'RUNNING' });
    return rows.first();
  }
  runningRuns() {
    return this.orm.CrawlerRun.where({ status: 'RUNNING' }).all();
  }
  queuedRun(sourceIds: string[]) {
    return this.orm.CrawlerRun.where({ status: 'QUEUED' })
      .where((r) => r.sourceId.in(sourceIds))
      .orderBy([(r) => r.queuedAt.asc(), (r) => r.id.asc()])
      .first();
  }
  async listRuns(sourceId: string, page: number, limit: number) {
    const rows = this.orm.CrawlerRun.where({ sourceId });
    const { total } = await rows.aggregate((a) => ({ total: a.count() }));
    return {
      total,
      rows: await rows
        .orderBy([(r) => r.queuedAt.desc(), (r) => r.id.desc()])
        .offset((page - 1) * limit)
        .limit(limit)
        .all(),
    };
  }
  run(id: string, sourceId?: string) {
    let rows = this.orm.CrawlerRun.where({ id });
    if (sourceId) rows = rows.where({ sourceId });
    return rows.first();
  }
  async heartbeat(workerId: string, sourceIds: string[], now: Date) {
    const existing = await this.orm.CrawlerWorker.where({ workerId }).first();
    const values = {
      sourceIds: JSON.stringify(sourceIds),
      lastSeenAt: now.toISOString(),
    };
    if (existing)
      await this.orm.CrawlerWorker.where({ workerId }).update(values);
    else await this.orm.CrawlerWorker.create({ workerId, ...values });
  }
  batch(runId: string, batchId: string) {
    return this.orm.CrawlerBatch.where({ runId, batchId }).first();
  }
  createBatch(input: {
    runId: string;
    batchId: string;
    payloadHash: string;
    acknowledgment: string;
  }) {
    return this.orm.CrawlerBatch.create(input);
  }
}
@Injectable()
export class CrawlerRepository {
  /** Short serialized transactions fence claims, leases and batch writes together. */
  transaction<T>(operation: (store: CrawlerStore, now: Date) => Promise<T>) {
    return db.transaction(async (tx) => {
      await tx.query(
        db.raw.sql`SELECT pg_advisory_xact_lock(1846532102)::text AS locked`
          .returnsRow({ locked: 'pg/text@1' })
          .build(),
      );
      return operation(new CrawlerStore(tx.orm.public), new Date());
    });
  }
}
