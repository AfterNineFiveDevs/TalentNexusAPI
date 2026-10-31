import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  AdminInviteDto,
  AdminIdParamsDto,
  AdminListQueryDto,
  adminInvitationSchema,
  adminMemberSchema,
} from '@talent-nexus/contracts';
import { z } from 'zod';
import { AdminNoStoreInterceptor } from './admin-no-store.interceptor';
import { CurrentUser } from '../@decorators/current-user.decorator';
import { AdminGuard } from '../auth/admin.guard';
import { AdminAuthService, type AdminPrincipal } from './admin-auth.service';
import { paginated } from '../common/http/api-response.factory';

const meta = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});
const wireSchema = (schema: z.ZodType) =>
  Object.fromEntries(
    Object.entries(z.toJSONSchema(schema)).filter(([key]) => key !== '$schema'),
  );
const detail = wireSchema(
  z.object({ success: z.literal(true), data: adminInvitationSchema }),
);
const list = (schema: z.ZodType) =>
  wireSchema(
    z.object({ success: z.literal(true), data: z.array(schema), meta }),
  );

@UseInterceptors(AdminNoStoreInterceptor)
@ApiResponse({ status: 400, description: 'Invalid payload or identifier' })
@ApiResponse({ status: 401, description: 'Invalid or revoked session' })
@ApiResponse({ status: 403, description: 'Active admin MFA session required' })
@ApiResponse({
  status: 404,
  description: 'Administrator or invitation not found',
})
@ApiResponse({
  status: 409,
  description: 'Conflicting access or invitation state',
})
@ApiResponse({ status: 429, description: 'Invitation resend cooldown' })
@ApiResponse({
  status: 503,
  description: 'Email provider did not accept the invitation',
})
@ApiTags('Administrator access')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminAccessController {
  constructor(private readonly auth: AdminAuthService) {}
  @Get('administrators')
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  @ApiResponse({ status: 200, schema: list(adminMemberSchema) })
  @ApiOperation({
    summary: 'List safe administrator identities and access state',
  })
  async members(
    @CurrentUser() actor: AdminPrincipal,
    @Query() query: AdminListQueryDto,
  ) {
    return this.page(
      await this.auth.listMembers(actor, query.page, query.limit),
      query,
    );
  }
  @Get('invitations')
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  @ApiResponse({ status: 200, schema: list(adminInvitationSchema) })
  async invitations(
    @CurrentUser() actor: AdminPrincipal,
    @Query() query: AdminListQueryDto,
  ) {
    return this.page(
      await this.auth.listInvitations(actor, query.page, query.limit),
      query,
    );
  }
  @Post('invitations')
  @ApiResponse({ status: 201, schema: detail })
  @ApiBody({ type: AdminInviteDto })
  invite(@CurrentUser() actor: AdminPrincipal, @Body() body: AdminInviteDto) {
    return this.auth.invite(actor, body);
  }
  @Post('invitations/:id/resend')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, schema: detail })
  @HttpCode(200)
  resend(
    @CurrentUser() actor: AdminPrincipal,
    @Param() params: AdminIdParamsDto,
  ) {
    return this.auth.resend(actor, params.id);
  }
  @Post('invitations/:id/revoke')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Invitation revoked' })
  @HttpCode(204)
  revoke(
    @CurrentUser() actor: AdminPrincipal,
    @Param() params: AdminIdParamsDto,
  ) {
    return this.auth.revokeInvitation(actor, params.id);
  }
  @Post('administrators/:id/disable')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 204,
    description: 'Admin access disabled; original role restored',
  })
  @HttpCode(204)
  disable(
    @CurrentUser() actor: AdminPrincipal,
    @Param() params: AdminIdParamsDto,
  ) {
    return this.auth.disable(actor, params.id);
  }
  private page<T>(
    result: { data: T[]; total: number },
    query: AdminListQueryDto,
  ) {
    const totalPages = Math.ceil(result.total / query.limit);
    return paginated(result.data, {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    });
  }
}
