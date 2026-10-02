import { Injectable } from '@nestjs/common';
import { db } from 'src/prisma/db';

type SessionRevocationReason = 'LOGOUT' | 'LOGOUT_ALL' | 'TOKEN_REUSE';

export interface StoredAuthSession {
  id: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: SessionRevocationReason | null;
  user: {
    id: string;
    email: string;
    role: 'TALENT' | 'RECRUITER' | 'ADMIN';
  };
}

export interface AuthSessionStore {
  findByIdWithUser(id: string): Promise<StoredAuthSession | null>;
  rotateIfCurrent(input: {
    id: string;
    currentRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    nextExpiresAt: string;
    now: string;
  }): Promise<{ id: string } | null>;
  revokeIfActive(
    id: string,
    now: string,
    reason?: SessionRevocationReason,
  ): Promise<void>;
}

class PrismaAuthSessionStore implements AuthSessionStore {
  constructor(private readonly prisma: typeof db.orm.public) {}

  findByIdWithUser(id: string): Promise<StoredAuthSession | null> {
    return this.prisma.AuthSession.where({ id }).include('user').first();
  }

  rotateIfCurrent(input: {
    id: string;
    currentRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    nextExpiresAt: string;
    now: string;
  }) {
    return this.prisma.AuthSession.where({ id: input.id })
      .where({ refreshTokenHash: input.currentRefreshTokenHash })
      .where((session) => session.revokedAt.isNull())
      .where((session) => session.expiresAt.gt(input.now))
      .select('id')
      .update({
        refreshTokenHash: input.nextRefreshTokenHash,
        expiresAt: input.nextExpiresAt,
        lastRotatedAt: input.now,
      });
  }

  async revokeIfActive(
    id: string,
    now: string,
    reason?: SessionRevocationReason,
  ): Promise<void> {
    await this.prisma.AuthSession.where({ id })
      .where((session) => session.revokedAt.isNull())
      .update({
        revokedAt: now,
        ...(reason ? { revocationReason: reason } : {}),
      });
  }
}

@Injectable()
export class AuthSessionRepository extends PrismaAuthSessionStore {
  constructor() {
    super(db.orm.public);
  }

  create(input: {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: string;
  }) {
    return db.orm.public.AuthSession.create(input);
  }

  transaction<TResult>(
    operation: (sessions: AuthSessionStore) => Promise<TResult>,
  ): Promise<TResult> {
    return db.transaction((transaction) =>
      operation(new PrismaAuthSessionStore(transaction.orm.public)),
    );
  }

  async revokeCurrent(input: {
    id: string;
    refreshTokenHash: string;
    now: string;
  }): Promise<void> {
    await db.orm.public.AuthSession.where({ id: input.id })
      .where({ refreshTokenHash: input.refreshTokenHash })
      .where((session) => session.revokedAt.isNull())
      .update({
        revokedAt: input.now,
        revocationReason: 'LOGOUT',
      });
  }

  async revokeAll(userId: string, now: string): Promise<void> {
    await db.orm.public.AuthSession.where({ userId })
      .where((session) => session.revokedAt.isNull())
      .updateAndCount({
        revokedAt: now,
        revocationReason: 'LOGOUT_ALL',
      });
  }
}
