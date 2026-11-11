import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AdminAnalyticsQueryDto,
  adminAnalyticsOverviewSchema,
} from '@talent-nexus/contracts';
import { AdminGuard } from '../auth/admin.guard';
import { AdminNoStoreInterceptor } from '../admin-auth/admin-no-store.interceptor';
import { detailSchema } from '../common/swagger/response-schemas';
import { AdminAnalyticsService } from './admin-analytics.service';
@ApiTags('Admin analytics')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@UseInterceptors(AdminNoStoreInterceptor)
@ApiResponse({
  status: 400,
  description:
    'Only period=7, 30 or 90 is supported; segments are not supported',
})
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Active admin MFA session required' })
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}
  @Get('overview')
  @ApiQuery({ name: 'period', required: false, enum: [7, 30, 90] })
  @ApiResponse({
    status: 200,
    schema: detailSchema(adminAnalyticsOverviewSchema),
  })
  @ApiOperation({
    summary:
      'Candidate registrations and first publications in Asia/Yangon; activity metrics are unavailable',
  })
  overview(@Query() query: AdminAnalyticsQueryDto) {
    return this.analytics.overview(query);
  }
}
