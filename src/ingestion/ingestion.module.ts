import { Module } from '@nestjs/common';
import { IngestionGrpcController } from './ingestion.grpc.controller.js';
import { IngestionRepository } from './ingestion.repository.js';
import { IngestionService } from './ingestion.service.js';

@Module({
  providers: [IngestionRepository,IngestionService],
  controllers: [IngestionGrpcController],
})
export class IngestionModule {}
