import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import type {
  AdminJobsQuery,
  AdminJobsFilter,
  JobContent,
} from '@talent-nexus/contracts';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Models } from '../prisma/contract';

import { db } from '../prisma/db';

export type JobRow = Scalars<Models.public_Job>;
export type JobWrite = Partial<Omit<JobRow, 'id' | 'createdAt' | 'updatedAt'>>;

function containsPattern(value: string): string {
  const escaped = value.replace(/[\\%_]/g, '\\$&');
  return `%${escaped}%`;
}

export class JobsStore {
  constructor(private readonly orm: typeof db.orm.public) {}
  private filtered(query: AdminJobsFilter) {
    let jobs = this.orm.Job;

    if (query.deletion === 'active') {
      jobs = jobs.where((job) => job.deletedAt.isNull());
    } else if (query.deletion === 'deleted') {
      jobs = jobs.where((job) => job.deletedAt.isNotNull());
    }

    if (query.location !== undefined) {
      const pattern = containsPattern(query.location);

      jobs = jobs.where((job) => job.location.ilike(pattern));
    }

    if (query.title !== undefined) {
      const pattern = containsPattern(query.title);

      jobs = jobs.where((job) => job.title.ilike(pattern));
    }

    if (query.companyName !== undefined) {
      const pattern = containsPattern(query.companyName);

      jobs = jobs.where((job) => job.companyName.ilike(pattern));
    }

    if (query.sourceId !== undefined) {
      jobs = jobs.where({ sourceId: query.sourceId });
    }

    if (query.status !== undefined) {
      jobs = jobs.where({ status: query.status });
    }

    if (query.categoryId !== undefined)
      jobs = jobs.where({ categoryId: query.categoryId });
    return jobs;
  }
  async summary(query: AdminJobsFilter) {
    const rows = await this.filtered(query)
      .groupBy('status')
      .aggregate((a) => ({ count: a.count() }));
    const statusCounts = { PENDING: 0, PUBLISHED: 0, REJECTED: 0, CLOSED: 0 };
    for (const row of rows) statusCounts[row.status] = row.count;
    return {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      statusCounts,
    };
  }
  async sources(query: AdminJobsFilter) {
    const rows = await this.filtered(query)
      .groupBy('sourceId')
      .aggregate((a) => ({ count: a.count() }));
    return rows.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }
  category(id: string) {
    return this.orm.Category.where({ id }).select('status').first();
  }
  async findMany(query: AdminJobsQuery) {
    const jobs = this.filtered(query);
    const { total } = await jobs.aggregate((aggregate) => ({
      total: aggregate.count(),
    }));

    const offset = (query.page - 1) * query.limit;

    const items = await jobs
      .select(
        'id',
        'categoryId',
        'title',
        'companyName',
        'location',
        'sourceId',
        'sourceUrl',
        'status',
        'createdAt',
        'updatedAt',
        'lastSeenAt',
        'publishedAt',
        'version',
        'deletedAt',
      )
      .orderBy([
        (job) =>
          query.sortOrder === 'asc'
            ? job[query.sortBy].asc()
            : job[query.sortBy].desc(),
        (job) => (query.sortOrder === 'asc' ? job.id.asc() : job.id.desc()),
      ])
      .offset(offset)
      .limit(query.limit)
      .all();

    return {
      items,
      total,
    };
  }

  async findById(id: string): Promise<JobRow | null> {
    return this.orm.Job.where({ id }).first();
  }

  async createManual(
    content: JobContent,
    actorId: string,
    note?: string,
  ): Promise<JobRow> {
    const now = new Date().toISOString();
    return this.orm.Job.create({
      ...content,
      sourceId: 'manual',
      externalId: randomUUID(),
      status: 'PENDING',
      adminEditedAt: now,
      lastAdminAction: 'CREATE',
      lastAdminActionById: actorId,
      lastAdminActionAt: now,
      lastAdminActionNote: note ?? null,
    });
  }

  // Compare-and-swap protects the interval between the service read and write.
  async compareAndUpdate(
    current: JobRow,
    changes: JobWrite,
  ): Promise<JobRow | null> {
    let jobs = this.orm.Job.where({
      id: current.id,
      version: current.version,
      status: current.status,
    });
    jobs =
      current.deletedAt === null
        ? jobs.where((job) => job.deletedAt.isNull())
        : jobs.where({ deletedAt: current.deletedAt });

    return jobs.update({ ...changes, version: current.version + 1 });
  }
}

@Injectable()
export class JobsRepository extends JobsStore {
  constructor() {
    super(db.orm.public);
  }
  transaction<T>(operation: (store: JobsStore) => Promise<T>) {
    return db.transaction(async (tx) => {
      await tx.query(
        db.raw.sql`SELECT pg_advisory_xact_lock(1846532101)::text AS locked`
          .returnsRow({ locked: 'pg/text@1' })
          .build(),
      );
      return operation(new JobsStore(tx.orm.public));
    });
  }
}
