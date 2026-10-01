import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCookieAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type AuthenticatedUser,
  ForgotPasswordRequestDto,
  LoginRequestDto,
  RefreshResponseDto,
  ResendVerificationRequestDto,
  ResetPasswordRequestDto,
  SignUpRequestDto,
  VerifyEmailRequestDto,
} from '@talent-nexus/contracts';
import type { Request, Response } from 'express';
import { CurrentUser } from 'src/@decorators/current-user.decorator';
import { Public } from 'src/@decorators/public.decorator';
import { AuthActionTokenService } from './auth-action-token.service';
import { AuthService } from './auth.service';
import { CookieOriginGuard } from './cookie-origin.guard';
import { LocalAuthGuard } from './local-auth.guard';
import { RefreshTokenCookieService } from './refresh-token-cookie.service';

@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly actionTokens: AuthActionTokenService,
    private readonly refreshTokenCookie: RefreshTokenCookieService,
  ) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignUpRequestDto) {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email/resend')
  @ApiBody({ type: ResendVerificationRequestDto })
  resendVerification(@Body() dto: ResendVerificationRequestDto) {
    return this.actionTokens.resendVerification(dto.email);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiBody({ type: VerifyEmailRequestDto })
  verifyEmail(@Body() dto: VerifyEmailRequestDto) {
    return this.actionTokens.verifyEmail(dto.token);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiBody({ type: ForgotPasswordRequestDto })
  forgotPassword(@Body() dto: ForgotPasswordRequestDto) {
    return this.actionTokens.forgotPassword(dto.email);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiBody({ type: ResetPasswordRequestDto })
  resetPassword(@Body() dto: ResetPasswordRequestDto) {
    return this.actionTokens.resetPassword(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiBody({ type: LoginRequestDto })
  async login(
    @Body() credentials: LoginRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    void credentials;
    const session = await this.authService.login(user);
    this.refreshTokenCookie.write(response, session.refreshToken);
    return session.response;
  }

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Public()
  @UseGuards(CookieOriginGuard)
  @ApiCookieAuth('refresh')
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponseDto> {
    try {
      const session = await this.authService.refresh(
        this.refreshTokenCookie.read(request),
      );
      this.refreshTokenCookie.write(response, session.refreshToken);
      return session.response;
    } catch (error: unknown) {
      this.refreshTokenCookie.clear(response);
      throw error;
    }
  }

  @Public()
  @UseGuards(CookieOriginGuard)
  @ApiCookieAuth('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.refreshTokenCookie.read(request));
    this.refreshTokenCookie.clear(response);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    this.refreshTokenCookie.clear(response);
  }
}
