import { Module } from '@nestjs/common';
import { AdminCrawlerController } from './crawler.controller';
import { CrawlerRepository } from './crawler.repository';
import { CrawlerControlService } from './crawler.service';
import { WorkerAuthService } from './worker-auth.service';
@Module({
  controllers: [AdminCrawlerController],
  providers: [CrawlerRepository, CrawlerControlService, WorkerAuthService],
  exports: [CrawlerRepository, CrawlerControlService, WorkerAuthService],
})
export class CrawlerControlModule {}
