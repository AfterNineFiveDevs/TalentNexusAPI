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
    for (const job of request.jobs) {
      const existing = await this.repository.findBySource(
        request.sourceId,
        job.externalId,
      );

      if (!existing) {
        await this.repository.createPendingJob(request.sourceId, job);

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
        await this.repository.updatePendingJob(
          request.sourceId,
          job,
          existing.version,
        );
      }

      await this.repository.touchLastSeen(request.sourceId, job.externalId);
    }

    return { received: request.jobs.length };
  }
}
