import { Module } from '@nestjs/common';
import { IngestionGrpcController } from './ingestion.grpc.controller.js';
import { IngestionRepository } from './ingestion.repository.js';
import { IngestionService } from './ingestion.service.js';
import { CrawlerControlModule } from '../crawler-control/crawler.module';
import { WorkerIngestionService } from './worker-ingestion.service';

@Module({
  imports: [CrawlerControlModule],
  providers: [IngestionRepository, IngestionService, WorkerIngestionService],
  controllers: [IngestionGrpcController],
})
export class IngestionModule {}
