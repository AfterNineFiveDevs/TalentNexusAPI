import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import type { AdminJobsQuery, JobContent } from '@talent-nexus/contracts';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Models } from '../prisma/contract';

import { db } from '../prisma/db';

export type JobRow = Scalars<Models.public_Job>;
export type JobWrite = Partial<Omit<JobRow, 'id' | 'createdAt' | 'updatedAt'>>;

function containsPattern(value: string): string {
  const escaped = value.replace(/[\\%_]/g, '\\$&');
  return `%${escaped}%`;
}

@Injectable()
export class JobsRepository {
  async findMany(query: AdminJobsQuery) {
    let jobs = db.orm.public.Job;

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

    const { total } = await jobs.aggregate((aggregate) => ({
      total: aggregate.count(),
    }));

    const offset = (query.page - 1) * query.limit;

    const items = await jobs
      .select(
        'id',
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
    return db.orm.public.Job.where({ id }).first();
  }

  async createManual(
    content: JobContent,
    actorId: string,
    note?: string,
  ): Promise<JobRow> {
    const now = new Date().toISOString();
    return db.orm.public.Job.create({
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
    let jobs = db.orm.public.Job.where({
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
