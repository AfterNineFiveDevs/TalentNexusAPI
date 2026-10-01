import { Injectable } from '@nestjs/common';
import { db } from 'src/prisma/db';

export type AuthActionTokenPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export interface StoredAuthActionToken {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: AuthActionTokenPurpose;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    verifiedAt: string | null;
  };
}

export interface AuthActionTokenStore {
  findByHashAndPurpose(
    tokenHash: string,
    purpose: AuthActionTokenPurpose,
  ): Promise<StoredAuthActionToken | null>;
  consumeAllForUserPurpose(
    userId: string,
    purpose: AuthActionTokenPurpose,
    consumedAt: string,
  ): Promise<void>;
  markUserVerified(userId: string, verifiedAt: string): Promise<void>;
  updateUserPassword(userId: string, password: string): Promise<void>;
  revokeUserSessions(userId: string, revokedAt: string): Promise<void>;
}

class PrismaAuthActionTokenStore implements AuthActionTokenStore {
  constructor(private readonly prisma: typeof db.orm.public) {}

  findByHashAndPurpose(
    tokenHash: string,
    purpose: AuthActionTokenPurpose,
  ): Promise<StoredAuthActionToken | null> {
    return this.prisma.AuthActionToken.where({ tokenHash, purpose })
      .include('user')
      .first();
  }

  async consumeAllForUserPurpose(
    userId: string,
    purpose: AuthActionTokenPurpose,
    consumedAt: string,
  ): Promise<void> {
    await this.prisma.AuthActionToken.where({ userId, purpose })
      .where((token) => token.consumedAt.isNull())
      .updateAndCount({ consumedAt });
  }

  async markUserVerified(userId: string, verifiedAt: string): Promise<void> {
    await this.prisma.User.where({ id: userId }).update({ verifiedAt });
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    await this.prisma.User.where({ id: userId }).update({ password });
  }

  async revokeUserSessions(userId: string, revokedAt: string): Promise<void> {
    await this.prisma.AuthSession.where({ userId })
      .where((session) => session.revokedAt.isNull())
      .updateAndCount({
        revokedAt,
        revocationReason: 'LOGOUT_ALL',
      });
  }
}

@Injectable()
export class AuthActionTokenRepository extends PrismaAuthActionTokenStore {
  constructor() {
    super(db.orm.public);
  }

  create(input: {
    userId: string;
    tokenHash: string;
    purpose: AuthActionTokenPurpose;
    expiresAt: string;
  }) {
    return db.orm.public.AuthActionToken.create(input);
  }

  findLatestForUser(userId: string, purpose: AuthActionTokenPurpose) {
    return db.orm.public.AuthActionToken.where({ userId, purpose })
      .orderBy((token) => token.createdAt.desc())
      .first();
  }

  async deleteById(id: string): Promise<void> {
    await db.orm.public.AuthActionToken.where({ id }).delete();
  }

  transaction<TResult>(
    operation: (tokens: AuthActionTokenStore) => Promise<TResult>,
  ): Promise<TResult> {
    return db.transaction((transaction) =>
      operation(new PrismaAuthActionTokenStore(transaction.orm.public)),
    );
  }
}
