import { Module } from '@nestjs/common';
import { AdminAnalyticsRepository } from './admin-analytics.repository';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
@Module({
  providers: [AdminAnalyticsRepository, AdminAnalyticsService],
  controllers: [AdminAnalyticsController],
})
export class AdminAnalyticsModule {}
