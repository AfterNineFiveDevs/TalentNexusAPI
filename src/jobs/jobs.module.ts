import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AdminJobsController } from './admin-jobs.controller';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';

@Module({
  controllers: [AdminJobsController],
  providers: [AdminGuard, JobsRepository, JobsService],
})
export class JobsModule {}
