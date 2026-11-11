import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
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
import {
  AdminCategoriesQueryDto,
  CategoryPaginationDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryVersionDto,
  CategoryIdParamsDto,
  CategorySubscriptionParamsDto,
  adminCategorySchema,
  publicCategorySchema,
  categorySubscriberSchema,
  categorySubscriptionSchema,
  type AuthenticatedUser,
} from '@talent-nexus/contracts';
import { AdminGuard } from '../auth/admin.guard';
import { Public } from '../@decorators/public.decorator';
import { CurrentUser } from '../@decorators/current-user.decorator';
import { AdminNoStoreInterceptor } from '../admin-auth/admin-no-store.interceptor';
import { detailSchema, pageSchema } from '../common/swagger/response-schemas';
import { CategoriesService } from './categories.service';

@ApiTags('Admin categories')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@UseInterceptors(AdminNoStoreInterceptor)
@ApiResponse({
  status: 400,
  description: 'Invalid category fields, ID or query',
})
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({
  status: 403,
  description: 'Active MFA administrator session required',
})
@ApiResponse({ status: 404, description: 'Category not found' })
@ApiResponse({
  status: 409,
  description: 'Name, version or lifecycle conflict',
})
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Get()
  @ApiResponse({ status: 200, schema: pageSchema(adminCategorySchema) })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ACTIVE', 'HIDDEN', 'ARCHIVED', 'all'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Query() query: AdminCategoriesQueryDto) {
    return this.categories.list(query);
  }
  @Post()
  @ApiBody({ type: CreateCategoryDto })
  @ApiResponse({ status: 201, schema: detailSchema(adminCategorySchema) })
  create(@Body() body: CreateCategoryDto) {
    return this.categories.create(body);
  }
  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailSchema(adminCategorySchema) })
  detail(@Param() params: CategoryIdParamsDto) {
    return this.categories.detail(params.id);
  }
  @Patch(':id')
  @ApiBody({ type: UpdateCategoryDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailSchema(adminCategorySchema) })
  update(
    @Param() params: CategoryIdParamsDto,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.categories.update(params.id, body);
  }
  @Post(':id/archive')
  @HttpCode(200)
  @ApiBody({ type: CategoryVersionDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailSchema(adminCategorySchema) })
  archive(
    @Param() params: CategoryIdParamsDto,
    @Body() body: CategoryVersionDto,
  ) {
    return this.categories.archive(params.id, body.expectedVersion);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @ApiBody({ type: CategoryVersionDto })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detailSchema(adminCategorySchema) })
  restore(
    @Param() params: CategoryIdParamsDto,
    @Body() body: CategoryVersionDto,
  ) {
    return this.categories.restore(params.id, body.expectedVersion);
  }
  @Get(':id/subscribers')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: pageSchema(categorySubscriberSchema) })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  subscribers(
    @Param() params: CategoryIdParamsDto,
    @Query() query: CategoryPaginationDto,
  ) {
    return this.categories.subscribers(params.id, query);
  }
}
@ApiTags('Category catalog')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}
  @Public()
  @Get()
  @ApiResponse({ status: 200, schema: pageSchema(publicCategorySchema) })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  catalog(@Query() query: CategoryPaginationDto) {
    return this.categories.catalog(query);
  }
}
@ApiTags('Candidate category subscriptions')
@ApiBearerAuth()
@Controller('me/category-subscriptions')
@UseInterceptors(AdminNoStoreInterceptor)
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Current candidate account required' })
export class CategorySubscriptionsController {
  constructor(private readonly categories: CategoriesService) {}
  @Get()
  @ApiResponse({ status: 200, schema: pageSchema(categorySubscriptionSchema) })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CategoryPaginationDto,
  ) {
    return this.categories.subscriptions(user.id, query);
  }
  @Put(':categoryId')
  @HttpCode(200)
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    schema: detailSchema(categorySubscriptionSchema),
  })
  @ApiResponse({ status: 404, description: 'Active category not found' })
  @ApiOperation({
    summary: 'Subscribe yourself to an active category; records interest only',
  })
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CategorySubscriptionParamsDto,
  ) {
    return this.categories.subscribe(user.id, params.categoryId);
  }
  @Delete(':categoryId')
  @HttpCode(204)
  @ApiParam({ name: 'categoryId', format: 'uuid' })
  @ApiResponse({
    status: 204,
    description: 'Unsubscribed, including when no subscription existed',
  })
  unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: CategorySubscriptionParamsDto,
  ) {
    return this.categories.unsubscribe(user.id, params.categoryId);
  }
}
