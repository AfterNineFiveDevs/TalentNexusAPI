import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  IngestJobsRequestType,
  IngestJobsResponseType,
} from '@talent-nexus/contracts/grpc';
import { Public } from 'src/@decorators/public.decorator';
import { HumanReadableConsoleLogger } from 'src/common/observability/human-readable-console.logger';
import { IngestionService } from './ingestion.service';

@Controller()
export class IngestionGrpcController {
  private readonly logger = new Logger(IngestionGrpcController.name);
  
  constructor(
  private readonly ingestionService: IngestionService,
) {}

  @Public()
  @GrpcMethod('JobIngestionService', 'IngestJobs')
  async ingestJobs(request: IngestJobsRequestType): Promise<IngestJobsResponseType> {
    this.logger.log(
      `Received ${request.jobs.length} jobs for ingestion from ${request.sourceId}`,
    );
    const response = await this.ingestionService.ingestJobs(request)
     this.logger.log(
    `Processed ${response.received} jobs from ${request.sourceId}`,
  );

  return response;
  }
}
