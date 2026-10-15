import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  IngestJobsRequestType,
  IngestJobsResponseType,
} from '@talent-nexus/contracts/grpc';
import { Public } from 'src/@decorators/public.decorator';
import { HumanReadableConsoleLogger } from 'src/common/observability/human-readable-console.logger';

@Controller('ingestion')
export class IngestionGrpcController {
  private readonly logger = new Logger(IngestionGrpcController.name);

  @Public()
  @GrpcMethod('JobIngestionService', 'IngestJobs')
  ingestJobs(request: IngestJobsRequestType): IngestJobsResponseType {
    this.logger.log(
      `Received ${request.jobs.length} jobs for ingestion from ${request.sourceId}`,
    );
    return { received: request.jobs.length };
  }
}
