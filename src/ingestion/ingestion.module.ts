import { Module } from '@nestjs/common';
import { IngestionGrpcController } from './ingestion.grpc.controller.js';

@Module({
  controllers: [IngestionGrpcController],
})
export class IngestionModule {}
