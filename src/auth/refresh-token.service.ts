import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  API_ERROR_MESSAGES,
  authenticatedUserSchema,
  type AuthenticatedUser,
} from '@talent-nexus/contracts';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { EnvironmentVariables } from 'src/config/environment';
import {
  AuthSessionRepository,
  type AuthSessionStore,
} from './auth-session.repository';

export interface RotatedRefreshToken {
  refreshToken: string;
  user: AuthenticatedUser;
}

type RotateSessionResult =
  | { status: 'ok'; user: AuthenticatedUser }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'reused' }
  | { status: 'revoked' };

@Injectable()
export class RefreshTokenService {
  private readonly ttlSeconds: number;

  constructor(
    private readonly sessions: AuthSessionRepository,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.ttlSeconds = config.getOrThrow('REFRESH_TOKEN_TTL_SECONDS', {
      infer: true,
    });
  }

  async create(userId: string): Promise<string> {
    const id = randomUUID();
    const secret = this.createSecret();
    await this.sessions.create({
      id,
      userId,
      refreshTokenHash: this.hash(secret),
      expiresAt: this.nextExpiry(),
    });
    return `${id}.${secret}`;
  }

  async rotate(rawToken: string | undefined): Promise<RotatedRefreshToken> {
    const current = this.parse(rawToken);
    if (!current) {
      throw new UnauthorizedException(API_ERROR_MESSAGES.REFRESH_TOKEN_INVALID);
    }

    const nextSecret = this.createSecret();
    const result = await this.sessions.transaction((sessions) =>
      this.rotateSession(sessions, {
        id: current.id,
        currentRefreshTokenHash: this.hash(current.secret),
        nextRefreshTokenHash: this.hash(nextSecret),
        nextExpiresAt: this.nextExpiry(),
        now: new Date().toISOString(),
      }),
    );

    if (result.status === 'invalid') {
      throw new UnauthorizedException(API_ERROR_MESSAGES.REFRESH_TOKEN_INVALID);
    }
    if (result.status === 'expired') {
      throw new UnauthorizedException(API_ERROR_MESSAGES.REFRESH_TOKEN_EXPIRED);
    }
    if (result.status === 'reused') {
      throw new UnauthorizedException(API_ERROR_MESSAGES.REFRESH_TOKEN_REUSED);
    }
    if (result.status === 'revoked') {
      throw new UnauthorizedException(API_ERROR_MESSAGES.SESSION_REVOKED);
    }

    return {
      refreshToken: `${current.id}.${nextSecret}`,
      user: result.user,
    };
  }

  async revokeCurrent(rawToken: string | undefined): Promise<void> {
    const current = this.parse(rawToken);
    if (!current) {
      return;
    }
    await this.sessions.revokeCurrent({
      id: current.id,
      refreshTokenHash: this.hash(current.secret),
      now: new Date().toISOString(),
    });
  }

  revokeAll(userId: string): Promise<void> {
    return this.sessions.revokeAll(userId, new Date().toISOString());
  }

  private createSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private async rotateSession(
    sessions: AuthSessionStore,
    input: {
      id: string;
      currentRefreshTokenHash: string;
      nextRefreshTokenHash: string;
      nextExpiresAt: string;
      now: string;
    },
  ): Promise<RotateSessionResult> {
    const session = await sessions.findByIdWithUser(input.id);
    if (!session) {
      return { status: 'invalid' };
    }

    if (session.revokedAt) {
      return {
        status:
          session.revocationReason === 'TOKEN_REUSE' ? 'reused' : 'revoked',
      };
    }

    if (
      new Date(session.expiresAt).getTime() <= new Date(input.now).getTime()
    ) {
      await sessions.revokeIfActive(input.id, input.now);
      return { status: 'expired' };
    }

    if (
      !this.hashesMatch(session.refreshTokenHash, input.currentRefreshTokenHash)
    ) {
      await sessions.revokeIfActive(input.id, input.now, 'TOKEN_REUSE');
      return { status: 'reused' };
    }

    const updated = await sessions.rotateIfCurrent(input);
    if (!updated) {
      await sessions.revokeIfActive(input.id, input.now, 'TOKEN_REUSE');
      return { status: 'reused' };
    }

    return {
      status: 'ok',
      user: authenticatedUserSchema.parse(session.user),
    };
  }

  private hashesMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private nextExpiry(): string {
    return new Date(Date.now() + this.ttlSeconds * 1000).toISOString();
  }

  private parse(
    rawToken: string | undefined,
  ): { id: string; secret: string } | undefined {
    if (!rawToken) {
      return;
    }
    const [id, secret, extra] = rawToken.split('.');
    if (
      extra !== undefined ||
      !id ||
      !secret ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !/^[A-Za-z0-9_-]{43}$/.test(secret)
    ) {
      return;
    }
    return { id, secret };
  }
}
