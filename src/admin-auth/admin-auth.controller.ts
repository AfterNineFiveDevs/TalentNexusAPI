import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { z } from 'zod';
import {
  AdminLoginDto,
  AdminChallengeDto,
  AdminMfaVerifyDto,
  AdminRecoveryVerifyDto,
  AdminInvitationTokenDto,
  AdminAcceptInvitationDto,
  AdminReauthenticateDto,
  adminNextStepSchema,
  adminEnrollmentSchema,
  adminSessionResponseSchema,
  adminEnrollmentCompleteSchema,
  adminProfileSchema,
  adminInvitationInspectionSchema,
} from '@talent-nexus/contracts';
import type { Request, Response } from 'express';
import { Public } from '../@decorators/public.decorator';
import { CurrentUser } from '../@decorators/current-user.decorator';
import { AdminGuard } from '../auth/admin.guard';
import { CookieOriginGuard } from '../auth/cookie-origin.guard';
import { AdminAuthService, type AdminPrincipal } from './admin-auth.service';
import { AdminCookieService } from './admin-cookie.service';

import { AdminNoStoreInterceptor } from './admin-no-store.interceptor';

const result = (schema: z.ZodType) => ({
  type: 'object' as const,
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean' as const, enum: [true] },
    data: Object.fromEntries(
      Object.entries(z.toJSONSchema(schema)).filter(
        ([key]) => key !== '$schema',
      ),
    ),
  },
});
@UseInterceptors(AdminNoStoreInterceptor)
@ApiTags('Admin authentication')
@ApiResponse({ status: 400, description: 'Invalid input or invitation' })
@ApiResponse({
  status: 401,
  description: 'Invalid, expired, consumed, or revoked credentials',
})
@ApiResponse({ status: 429, description: 'Attempt limit exceeded' })
@UseGuards(CookieOriginGuard, ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly cookie: AdminCookieService,
  ) {}
  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({ status: 200, schema: result(adminNextStepSchema) })
  @ApiOperation({
    summary:
      'Verify staff password; returns a restricted MFA challenge, never an access token',
  })
  login(@Body() body: AdminLoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post('mfa/enrollment')
  @HttpCode(200)
  @ApiBody({ type: AdminChallengeDto })
  @ApiResponse({ status: 200, schema: result(adminEnrollmentSchema) })
  enrollment(@Body() body: AdminChallengeDto) {
    return this.auth.enrollment(body.challengeToken);
  }

  @Public()
  @Post('mfa/enrollment/confirm')
  @HttpCode(200)
  @ApiBody({ type: AdminMfaVerifyDto })
  @ApiResponse({ status: 200, schema: result(adminEnrollmentCompleteSchema) })
  async confirm(
    @Body() body: AdminMfaVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.issue(
      response,
      await this.auth.confirmEnrollment(body.challengeToken, body.code),
    );
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @ApiBody({ type: AdminMfaVerifyDto })
  @ApiResponse({ status: 200, schema: result(adminSessionResponseSchema) })
  async verify(
    @Body() body: AdminMfaVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.issue(
      response,
      await this.auth.verify(body.challengeToken, { code: body.code }),
    );
  }

  @Public()
  @Post('mfa/recovery')
  @HttpCode(200)
  @ApiBody({ type: AdminRecoveryVerifyDto })
  @ApiResponse({ status: 200, schema: result(adminSessionResponseSchema) })
  async recover(
    @Body() body: AdminRecoveryVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.issue(
      response,
      await this.auth.verify(body.challengeToken, {
        recoveryCode: body.recoveryCode,
      }),
    );
  }

  @Public()
  @Post('invitations/inspect')
  @HttpCode(200)
  @ApiBody({ type: AdminInvitationTokenDto })
  @ApiResponse({ status: 200, schema: result(adminInvitationInspectionSchema) })
  inspect(@Body() body: AdminInvitationTokenDto) {
    return this.auth.inspectInvitation(body.token);
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  @ApiBody({ type: AdminAcceptInvitationDto })
  @ApiResponse({ status: 200, schema: result(adminNextStepSchema) })
  accept(@Body() body: AdminAcceptInvitationDto) {
    return this.auth.acceptInvitation(body);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth('admin-refresh')
  @ApiResponse({ status: 200, schema: result(adminSessionResponseSchema) })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return this.issue(
        response,
        await this.auth.refresh(this.cookie.read(request)),
      );
    } catch (error) {
      this.cookie.clear(response);
      throw error;
    }
  }
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth('admin-refresh')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(this.cookie.read(request));
    this.cookie.clear(response);
  }

  @Get('profile')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, schema: result(adminProfileSchema) })
  profile(@CurrentUser() user: AdminPrincipal) {
    return this.auth.profile(user);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  async logoutAll(
    @CurrentUser() user: AdminPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(user);
    this.cookie.clear(response);
  }

  @Post('mfa/recovery-codes/regenerate')
  @ApiResponse({
    status: 200,
    schema: result(z.object({ recoveryCodes: z.array(z.string()).length(10) })),
  })
  @HttpCode(200)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiBody({ type: AdminReauthenticateDto })
  regenerate(
    @CurrentUser() user: AdminPrincipal,
    @Body() body: AdminReauthenticateDto,
  ) {
    return this.auth.regenerateCodes(user, body);
  }

  private issue<T extends { sessionExpiresAt: string }>(
    response: Response,
    session: { refreshToken: string; response: T },
  ) {
    response.setHeader('Cache-Control', 'no-store');
    this.cookie.write(
      response,
      session.refreshToken,
      session.response.sessionExpiresAt,
    );
    return session.response;
  }
}
