import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { status } from '@grpc/grpc-js';
import { z } from 'zod';
import { crawlerScrapedJobSchema } from '@talent-nexus/contracts';
import { CrawlerRepository } from '../crawler-control/crawler.repository';
import {
  CrawlerControlService,
  emptyCounts,
  rpcError,
  type WorkerIdentity,
} from '../crawler-control/crawler.service';
import { IngestionRepository } from './ingestion.repository';
import { IngestionService } from './ingestion.service';

export const workerBatchSchema = z
  .object({
    sourceId: z.literal('myjobs'),
    runId: z.uuid(),
    leaseToken: z.string().regex(/^[a-f0-9]{64}$/),
    batchId: z.uuid(),
    jobs: z.array(crawlerScrapedJobSchema).min(1).max(25),
  })
  .strict()
  .refine(
    (v) => new Set(v.jobs.map((j) => j.externalId)).size === v.jobs.length,
    'Duplicate external IDs',
  );
@Injectable()
export class WorkerIngestionService {
  constructor(
    private readonly repository: CrawlerRepository,
    private readonly control: CrawlerControlService,
  ) {}
  async ingest(identity: WorkerIdentity, input: unknown) {
    const parsed = workerBatchSchema.safeParse(input);
    if (!parsed.success || !parsed.data)
      rpcError(status.INVALID_ARGUMENT, 'Invalid ingestion batch');
    const request = parsed.data;
    if (Buffer.byteLength(JSON.stringify(request)) > 1_000_000)
      rpcError(status.RESOURCE_EXHAUSTED, 'Batch exceeds one megabyte');
    return this.repository.transaction(async (orm, now) => {
      const run = await this.control.owned(
        orm,
        now,
        identity,
        request.runId,
        request.leaseToken,
      );
      if (run.sourceId !== request.sourceId)
        rpcError(status.PERMISSION_DENIED, 'Source not authorized');
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify({ sourceId: request.sourceId, jobs: request.jobs }),
        )
        .digest('hex');
      const receipt = await orm.batch(run.id, request.batchId);
      if (receipt) {
        if (receipt.payloadHash !== payloadHash)
          rpcError(
            status.ALREADY_EXISTS,
            'Batch ID reused with different content',
          );
        return JSON.parse(receipt.acknowledgment) as {
          received: number;
          created: number;
          updated: number;
          observed: number;
        };
      }
      const response = await new IngestionService(
        new IngestionRepository(orm.orm),
      ).ingestJobs(request);
      await this.control.owned(
        orm,
        new Date(),
        identity,
        request.runId,
        request.leaseToken,
      );
      await orm.createBatch({
        runId: run.id,
        batchId: request.batchId,
        payloadHash,
        acknowledgment: JSON.stringify(response),
      });
      const counts = JSON.parse(run.counts) as ReturnType<typeof emptyCounts>;
      for (const key of ['received', 'created', 'updated', 'observed'] as const)
        counts[key] += response[key] ?? 0;
      await orm.updateRun(run.id, {
        counts: JSON.stringify(counts),
      });
      return response;
    });
  }
}
