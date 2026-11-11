import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Metadata, status } from '@grpc/grpc-js';
import type {
  IngestJobsRequestType,
  WorkerRequestType,
} from '@talent-nexus/contracts/grpc';
import { Public } from '../@decorators/public.decorator';
import {
  CrawlerControlService,
  rpcError,
} from '../crawler-control/crawler.service';
import { WorkerAuthService } from '../crawler-control/worker-auth.service';
import { WorkerIngestionService } from './worker-ingestion.service';

@Public()
@Controller()
export class IngestionGrpcController {
  constructor(
    private readonly control: CrawlerControlService,
    private readonly auth: WorkerAuthService,
    private readonly ingestion: WorkerIngestionService,
  ) {}
  private identity(request: WorkerRequestType, metadata: Metadata) {
    this.auth.authenticate(metadata);
    return this.control.identity({
      workerId: request.workerId,
      sourceIds: request.sourceIds,
    });
  }
  @GrpcMethod('JobIngestionService', 'ClaimWork')
  async claimWork(request: WorkerRequestType, metadata: Metadata) {
    const identity = this.identity(request, metadata);
    return { payloadJson: JSON.stringify(await this.control.claim(identity)) };
  }
  @GrpcMethod('JobIngestionService', 'RenewLease')
  async renewLease(request: WorkerRequestType, metadata: Metadata) {
    const identity = this.identity(request, metadata);
    return {
      payloadJson: JSON.stringify(
        await this.control.renew(
          identity,
          request.runId ?? '',
          request.leaseToken ?? '',
        ),
      ),
    };
  }
  @GrpcMethod('JobIngestionService', 'CompleteRun')
  async completeRun(request: WorkerRequestType, metadata: Metadata) {
    const identity = this.identity(request, metadata);
    let payload: unknown;
    try {
      payload = JSON.parse(request.payloadJson);
    } catch {
      rpcError(status.INVALID_ARGUMENT, 'Invalid completion JSON');
    }
    return {
      payloadJson: JSON.stringify(
        await this.control.complete(
          identity,
          request.runId ?? '',
          request.leaseToken ?? '',
          payload,
        ),
      ),
    };
  }
  @GrpcMethod('JobIngestionService', 'IngestJobs')
  ingestJobs(request: IngestJobsRequestType, metadata: Metadata) {
    this.auth.authenticate(metadata);
    const workerId = metadata.get('x-worker-id')[0];
    const identity = this.control.identity({ workerId, sourceIds: ['myjobs'] });
    return this.ingestion.ingest(identity, request);
  }
}
