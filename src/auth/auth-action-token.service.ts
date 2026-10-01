import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  API_ERROR_MESSAGES,
  API_SUCCESS_MESSAGES,
  type ApiSuccessResponse,
  type ResetPasswordRequest,
} from '@talent-nexus/contracts';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { success } from 'src/common/http/api-response.factory';
import type { EnvironmentVariables } from 'src/config/environment';
import { UsersService } from 'src/users/users.service';
import {
  AuthActionTokenRepository,
  type AuthActionTokenPurpose,
  type AuthActionTokenStore,
} from './auth-action-token.repository';
import { AuthEmailService } from './auth-email.service';

type ConsumeResult =
  | { status: 'ok' }
  | { status: 'already-verified' }
  | { status: 'invalid' }
  | { status: 'expired' };

@Injectable()
export class AuthActionTokenService {
  private readonly logger = new Logger(AuthActionTokenService.name);
  private readonly verificationTtlSeconds: number;
  private readonly passwordResetTtlSeconds: number;
  private readonly cooldownSeconds: number;

  constructor(
    private readonly users: UsersService,
    private readonly tokens: AuthActionTokenRepository,
    private readonly email: AuthEmailService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.verificationTtlSeconds = config.getOrThrow(
      'EMAIL_VERIFICATION_TTL_SECONDS',
      { infer: true },
    );
    this.passwordResetTtlSeconds = config.getOrThrow(
      'PASSWORD_RESET_TTL_SECONDS',
      { infer: true },
    );
    this.cooldownSeconds = config.getOrThrow(
      'AUTH_ACTION_TOKEN_COOLDOWN_SECONDS',
      { infer: true },
    );
  }

  async sendRegistrationVerification(user: {
    id: string;
    email: string;
    verifiedAt: string | null;
  }): Promise<void> {
    if (!user.verifiedAt) {
      await this.issue(user, 'EMAIL_VERIFICATION');
    }
  }

  async resendVerification(email: string): Promise<ApiSuccessResponse<null>> {
    const user = await this.users.findOne(email);
    if (user && !user.verifiedAt) {
      await this.issue(user, 'EMAIL_VERIFICATION');
    }
    return success(null, API_SUCCESS_MESSAGES.EMAIL_VERIFICATION_SENT);
  }

  async forgotPassword(email: string): Promise<ApiSuccessResponse<null>> {
    const user = await this.users.findOne(email);
    if (user) {
      await this.issue(user, 'PASSWORD_RESET');
    }
    return success(null, API_SUCCESS_MESSAGES.PASSWORD_RESET_EMAIL_SENT);
  }

  async verifyEmail(token: string): Promise<ApiSuccessResponse<null>> {
    const result = await this.tokens.transaction((store) =>
      this.consumeVerification(
        store,
        this.hash(token),
        new Date().toISOString(),
      ),
    );

    if (result.status === 'invalid') {
      throw new BadRequestException(
        API_ERROR_MESSAGES.EMAIL_VERIFICATION_TOKEN_INVALID,
      );
    }
    if (result.status === 'expired') {
      throw new BadRequestException(
        API_ERROR_MESSAGES.EMAIL_VERIFICATION_TOKEN_EXPIRED,
      );
    }
    return success(null, API_SUCCESS_MESSAGES.EMAIL_VERIFIED);
  }

  async resetPassword(
    dto: ResetPasswordRequest,
  ): Promise<ApiSuccessResponse<null>> {
    const password = await bcrypt.hash(dto.password, 10);
    const result = await this.tokens.transaction((store) =>
      this.consumePasswordReset(
        store,
        this.hash(dto.token),
        password,
        new Date().toISOString(),
      ),
    );

    if (result.status === 'invalid') {
      throw new BadRequestException(
        API_ERROR_MESSAGES.PASSWORD_RESET_TOKEN_INVALID,
      );
    }
    if (result.status === 'expired') {
      throw new BadRequestException(
        API_ERROR_MESSAGES.PASSWORD_RESET_TOKEN_EXPIRED,
      );
    }
    return success(null, API_SUCCESS_MESSAGES.PASSWORD_RESET_SUCCESS);
  }

  private async issue(
    user: { id: string; email: string },
    purpose: AuthActionTokenPurpose,
  ): Promise<void> {
    const latest = await this.tokens.findLatestForUser(user.id, purpose);
    if (
      latest &&
      Date.now() - new Date(latest.createdAt).getTime() <
        this.cooldownSeconds * 1000
    ) {
      return;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const created = await this.tokens.create({
      userId: user.id,
      tokenHash: this.hash(rawToken),
      purpose,
      expiresAt: this.nextExpiry(purpose),
    });

    try {
      if (purpose === 'EMAIL_VERIFICATION') {
        await this.email.sendVerification(user.email, rawToken);
      } else {
        await this.email.sendPasswordReset(user.email, rawToken);
      }
    } catch (error: unknown) {
      this.logger.error(
        `Could not deliver ${purpose.toLowerCase().replaceAll('_', ' ')} email`,
        error instanceof Error ? error.message : String(error),
      );
      try {
        await this.tokens.deleteById(created.id);
      } catch (cleanupError: unknown) {
        this.logger.error(
          'Could not remove an undelivered auth action token',
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        );
      }
    }
  }

  private async consumeVerification(
    store: AuthActionTokenStore,
    tokenHash: string,
    now: string,
  ): Promise<ConsumeResult> {
    const token = await store.findByHashAndPurpose(
      tokenHash,
      'EMAIL_VERIFICATION',
    );
    if (!token) {
      return { status: 'invalid' };
    }
    if (token.consumedAt) {
      return token.user.verifiedAt
        ? { status: 'already-verified' }
        : { status: 'invalid' };
    }
    if (this.isExpired(token.expiresAt, now)) {
      return { status: 'expired' };
    }

    if (!token.user.verifiedAt) {
      await store.markUserVerified(token.userId, now);
    }
    await store.consumeAllForUserPurpose(
      token.userId,
      'EMAIL_VERIFICATION',
      now,
    );
    return { status: 'ok' };
  }

  private async consumePasswordReset(
    store: AuthActionTokenStore,
    tokenHash: string,
    password: string,
    now: string,
  ): Promise<ConsumeResult> {
    const token = await store.findByHashAndPurpose(tokenHash, 'PASSWORD_RESET');
    if (!token || token.consumedAt) {
      return { status: 'invalid' };
    }
    if (this.isExpired(token.expiresAt, now)) {
      return { status: 'expired' };
    }

    await store.updateUserPassword(token.userId, password);
    await store.consumeAllForUserPurpose(token.userId, 'PASSWORD_RESET', now);
    await store.revokeUserSessions(token.userId, now);
    return { status: 'ok' };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isExpired(expiresAt: string, now: string): boolean {
    return new Date(expiresAt).getTime() <= new Date(now).getTime();
  }

  private nextExpiry(purpose: AuthActionTokenPurpose): string {
    const ttl =
      purpose === 'EMAIL_VERIFICATION'
        ? this.verificationTtlSeconds
        : this.passwordResetTtlSeconds;
    return new Date(Date.now() + ttl * 1000).toISOString();
  }
}
