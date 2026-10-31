import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  AdminJobActionDto,
  AdminJobReasonDto,
  AdminJobsQueryDto,
  CreateAdminJobDto,
  JobIdParamsDto,
  PublishAdminJobDto,
  UpdateAdminJobDto,
  type AuthenticatedUser,
  adminJobDetailSchema,
  adminJobSummarySchema,
} from '@talent-nexus/contracts';
import { CurrentUser } from '../@decorators/current-user.decorator';
import { AdminGuard } from '../auth/admin.guard';
import { JobsService } from './jobs.service';

const schemaOf = (schema: z.ZodType) =>
  Object.fromEntries(
    Object.entries(z.toJSONSchema(schema)).filter(([key]) => key !== '$schema'),
  );
const detailResponse = {
  type: 'object' as const,
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: schemaOf(adminJobDetailSchema),
  },
};
const listResponse = {
  type: 'object' as const,
  required: ['success', 'data', 'meta'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: { type: 'array' as const, items: schemaOf(adminJobSummarySchema) },
    meta: {
      type: 'object' as const,
      required: [
        'page',
        'limit',
        'total',
        'totalPages',
        'hasNextPage',
        'hasPreviousPage',
      ],
      properties: {
        page: { type: 'integer' as const },
        limit: { type: 'integer' as const },
        total: { type: 'integer' as const },
        totalPages: { type: 'integer' as const },
        hasNextPage: { type: 'boolean' as const },
        hasPreviousPage: { type: 'boolean' as const },
      },
    },
  },
};

@ApiTags('Admin jobs')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid request' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Admin access required' })
@ApiResponse({ status: 404, description: 'Job not found' })
@ApiResponse({
  status: 409,
  description: 'Stale version or invalid lifecycle transition',
})
@UseGuards(AdminGuard)
@Controller('admin/jobs')
export class AdminJobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiResponse({ status: 200, schema: listResponse })
  @ApiOperation({ summary: 'List jobs with optional filters and pagination' })
  @ApiQuery({ name: 'location', required: false, type: String })
  @ApiQuery({ name: 'title', required: false, type: String })
  @ApiQuery({ name: 'companyName', required: false, type: String })
  @ApiQuery({ name: 'sourceId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'PUBLISHED', 'REJECTED', 'CLOSED'],
  })
  @ApiQuery({
    name: 'deletion',
    required: false,
    enum: ['active', 'deleted', 'all'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: [
      'createdAt',
      'updatedAt',
      'lastSeenAt',
      'publishedAt',
      'title',
      'companyName',
    ],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  list(@Query() query: AdminJobsQueryDto) {
    return this.jobs.findMany(query);
  }

  @Get(':id')
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Inspect a job, including deleted jobs' })
  detail(@Param() params: JobIdParamsDto) {
    return this.jobs.findById(params.id);
  }

  @Post()
  @ApiResponse({ status: 201, schema: detailResponse })
  @ApiOperation({ summary: 'Create a pending manual job' })
  @ApiBody({ type: CreateAdminJobDto })
  create(
    @Body() body: CreateAdminJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.create(body, user.id);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiOperation({
    summary: 'Edit content; published edits take effect immediately',
  })
  @ApiBody({ type: UpdateAdminJobDto })
  edit(
    @Param() params: JobIdParamsDto,
    @Body() body: UpdateAdminJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.edit(params.id, body, user.id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiOperation({
    summary: 'Publish a pending job with optional final content edits',
  })
  @ApiBody({ type: PublishAdminJobDto })
  publish(
    @Param() params: JobIdParamsDto,
    @Body() body: PublishAdminJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.publish(params.id, body, user.id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiOperation({ summary: 'Reject a pending job; note required' })
  @ApiBody({ type: AdminJobReasonDto })
  reject(
    @Param() params: JobIdParamsDto,
    @Body() body: AdminJobReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.reject(params.id, body, user.id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiOperation({ summary: 'Close a published job' })
  @ApiBody({ type: AdminJobActionDto })
  close(
    @Param() params: JobIdParamsDto,
    @Body() body: AdminJobActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.close(params.id, body, user.id);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiOperation({ summary: 'Return a rejected or closed job to pending' })
  @ApiBody({ type: AdminJobActionDto })
  reopen(
    @Param() params: JobIdParamsDto,
    @Body() body: AdminJobActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.reopen(params.id, body, user.id);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiOperation({
    summary: 'Soft-delete a job; JSON body with version and note required',
  })
  @ApiBody({ type: AdminJobReasonDto })
  delete(
    @Param() params: JobIdParamsDto,
    @Body() body: AdminJobReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.delete(params.id, body, user.id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailResponse })
  @ApiOperation({ summary: 'Restore a deleted job as pending' })
  @ApiBody({ type: AdminJobActionDto })
  restore(
    @Param() params: JobIdParamsDto,
    @Body() body: AdminJobActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobs.restore(params.id, body, user.id);
  }
}
