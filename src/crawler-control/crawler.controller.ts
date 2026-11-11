import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CrawlerPaginationDto,
  CrawlerRunParamsDto,
  CrawlerSourceParamsDto,
  UpdateCrawlerSourceDto,
  crawlerSourceSchema,
  crawlerRunSchema,
} from '@talent-nexus/contracts';
import { AdminGuard } from '../auth/admin.guard';
import { AdminNoStoreInterceptor } from '../admin-auth/admin-no-store.interceptor';
import { detailSchema, pageSchema } from '../common/swagger/response-schemas';
import { z } from 'zod';
import { CrawlerRunNowDto } from '@talent-nexus/contracts';
import { CrawlerControlService } from './crawler.service';

@ApiTags('Admin crawler')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@UseInterceptors(AdminNoStoreInterceptor)
@ApiResponse({
  status: 400,
  description: 'Invalid schedule, version, source or pagination',
})
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Active MFA administrator required' })
@ApiResponse({ status: 404, description: 'Source or run not found' })
@ApiResponse({
  status: 409,
  description: 'Stale configuration or source already active',
})
@Controller('admin/crawler/sources')
export class AdminCrawlerController {
  constructor(private readonly crawler: CrawlerControlService) {}
  @Get()
  @ApiResponse({
    status: 200,
    schema: detailSchema(z.array(crawlerSourceSchema)),
  })
  list() {
    return this.crawler.list();
  }
  @Get(':sourceId')
  @ApiParam({ name: 'sourceId', enum: ['myjobs'] })
  @ApiResponse({ status: 200, schema: detailSchema(crawlerSourceSchema) })
  detail(@Param() params: CrawlerSourceParamsDto) {
    return this.crawler.detail(params.sourceId);
  }
  @Patch(':sourceId')
  @ApiParam({ name: 'sourceId', enum: ['myjobs'] })
  @ApiBody({ type: UpdateCrawlerSourceDto })
  @ApiResponse({ status: 200, schema: detailSchema(crawlerSourceSchema) })
  update(
    @Param() params: CrawlerSourceParamsDto,
    @Body() body: UpdateCrawlerSourceDto,
  ) {
    return this.crawler.update(params.sourceId, body);
  }
  @Post(':sourceId/run')
  @ApiParam({ name: 'sourceId', enum: ['myjobs'] })
  @HttpCode(202)
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiResponse({ status: 202, schema: detailSchema(crawlerRunSchema) })
  manual(
    @Param() params: CrawlerSourceParamsDto,
    @Body() _body: CrawlerRunNowDto,
  ) {
    void _body;
    return this.crawler.manual(params.sourceId);
  }
  @Get(':sourceId/runs')
  @ApiParam({ name: 'sourceId', enum: ['myjobs'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, schema: pageSchema(crawlerRunSchema) })
  runs(
    @Param() params: CrawlerSourceParamsDto,
    @Query() query: CrawlerPaginationDto,
  ) {
    return this.crawler.runs(params.sourceId, query);
  }
  @Get(':sourceId/runs/:runId')
  @ApiParam({ name: 'sourceId', enum: ['myjobs'] })
  @ApiParam({ name: 'runId', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailSchema(crawlerRunSchema) })
  run(@Param() params: CrawlerRunParamsDto) {
    return this.crawler.run(params.sourceId, params.runId);
  }
}
