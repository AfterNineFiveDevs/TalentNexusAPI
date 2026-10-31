import { Injectable } from '@nestjs/common';

import type { ScrapedJobType } from '@talent-nexus/contracts/grpc';

import { db } from '../prisma/db';

@Injectable()
export class IngestionRepository {
  async createPendingJob(sourceId: string, job: ScrapedJobType) {
    return db.orm.public.Job.create({
      sourceId,
      externalId: job.externalId,
      sourceUrl: job.sourceUrl,
      title: job.title,
      companyName: job.companyName,
      description: job.description,
      location: job.location,
      applicationUrl: job.applicationUrl ?? [],
      status: 'PENDING',
    });
  }

  async findBySource(sourceId: string, externalId: string) {
    return db.orm.public.Job.where({ sourceId, externalId }).first();
  }

  async updatePendingJob(
    sourceId: string,
    job: ScrapedJobType,
    expectedVersion: number,
  ) {
    return db.orm.public.Job.where({
      sourceId,
      externalId: job.externalId,
      status: 'PENDING',
      version: expectedVersion,
    })
      .where((row) => row.deletedAt.isNull())
      .where((row) => row.adminEditedAt.isNull())
      .update({
        sourceUrl: job.sourceUrl,
        title: job.title,
        companyName: job.companyName,
        description: job.description,
        location: job.location,
        applicationUrl: job.applicationUrl ?? [],
        lastSeenAt: new Date().toISOString(),
        version: expectedVersion + 1,
      });
  }

  async touchLastSeen(sourceId: string, externalId: string) {
    return db.orm.public.Job.where({ sourceId, externalId }).update({
      lastSeenAt: new Date().toISOString(),
    });
  }
}
