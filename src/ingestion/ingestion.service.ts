import { Injectable } from '@nestjs/common';

import type {
  IngestJobsRequestType,
  IngestJobsResponseType,
} from '@talent-nexus/contracts/grpc';

import { IngestionRepository } from './ingestion.repository.js';

@Injectable()
export class IngestionService {
  constructor(private readonly repository: IngestionRepository) {}

  async ingestJobs(
    request: IngestJobsRequestType,
  ): Promise<IngestJobsResponseType> {
    let created = 0;
    let updated = 0;
    let observed = 0;
    for (const job of request.jobs) {
      const existing = await this.repository.findBySource(
        request.sourceId,
        job.externalId,
      );

      if (!existing) {
        await this.repository.createPendingJob(request.sourceId, job);
        created++;

        continue;
      }

      const contentChanged =
        existing.sourceUrl !== job.sourceUrl ||
        existing.title !== job.title ||
        existing.companyName !== job.companyName ||
        existing.description !== job.description ||
        existing.location !== job.location ||
        JSON.stringify(existing.applicationUrl) !==
          JSON.stringify(job.applicationUrl ?? []);

      if (
        existing.status === 'PENDING' &&
        existing.deletedAt === null &&
        existing.adminEditedAt === null &&
        contentChanged
      ) {
        const changed = await this.repository.updatePendingJob(
          request.sourceId,
          job,
          existing.version,
        );
        if (changed) updated++;
        else observed++;
      } else {
        observed++;
      }

      await this.repository.touchLastSeen(request.sourceId, job.externalId);
    }

    return { received: request.jobs.length, created, updated, observed };
  }
}
