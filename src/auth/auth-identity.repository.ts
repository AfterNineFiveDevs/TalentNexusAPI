import { Injectable } from '@nestjs/common';
import { db } from '../prisma/db.js';

/** Outside login providers stored in `authIdentity.provider`. */
export type OAuthProvider = 'GOOGLE' | 'LINKEDIN';

/** Value saved in `user.signUpMethod` for each provider. */
const signUpMethodByProvider = {
  GOOGLE: 'GOOGLE',
  LINKEDIN: 'LinkedIn',
} as const satisfies Record<OAuthProvider, string>;

interface StoredUser {
  id: string;
  email: string;
  role: 'TALENT' | 'RECRUITER' | 'ADMIN';
  name: string | null;
  verifiedAt: string | null;
}

export interface StoredOAuthIdentity {
  id: string;
  userId: string;
  providerSubject: string;
  user: StoredUser;
}

export interface AuthIdentityStore {
  findIdentity(
    provider: OAuthProvider,
    subject: string,
  ): Promise<StoredOAuthIdentity | null>;
  findIdentityByUserId(
    provider: OAuthProvider,
    userId: string,
  ): Promise<StoredOAuthIdentity | null>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  createOAuthUser(input: {
    provider: OAuthProvider;
    email: string;
    name?: string;
    now: string;
  }): Promise<StoredUser>;
  createIdentity(
    provider: OAuthProvider,
    userId: string,
    subject: string,
  ): Promise<void>;
  markUserVerified(userId: string, now: string): Promise<void>;
}

class PrismaAuthIdentityStore implements AuthIdentityStore {
  constructor(private readonly prisma: typeof db.orm.public) {}

  async findIdentity(
    provider: OAuthProvider,
    subject: string,
  ): Promise<StoredOAuthIdentity | null> {
    const identity = await this.prisma.AuthIdentity.where({ provider })
      .where({ providerSubject: subject })
      .include('user', (user) =>
        user.select('id', 'email', 'role', 'name', 'verifiedAt'),
      )
      .first();
    return identity?.user ? { ...identity, user: identity.user } : null;
  }

  async findIdentityByUserId(
    provider: OAuthProvider,
    userId: string,
  ): Promise<StoredOAuthIdentity | null> {
    const identity = await this.prisma.AuthIdentity.where({ userId })
      .where({ provider })
      .include('user', (user) =>
        user.select('id', 'email', 'role', 'name', 'verifiedAt'),
      )
      .first();
    return identity?.user ? { ...identity, user: identity.user } : null;
  }

  findUserByEmail(email: string) {
    return this.prisma.User.where({ email })
      .select('id', 'email', 'role', 'name', 'verifiedAt')
      .first();
  }

  createOAuthUser(input: {
    provider: OAuthProvider;
    email: string;
    name?: string;
    now: string;
  }) {
    return this.prisma.User.select(
      'id',
      'email',
      'role',
      'name',
      'verifiedAt',
    ).create({
      email: input.email,
      password: null,
      name: input.name ?? null,
      role: 'TALENT',
      termAccepted: true,
      signUpMethod: signUpMethodByProvider[input.provider],
      verifiedAt: input.now,
    });
  }

  async createIdentity(
    provider: OAuthProvider,
    userId: string,
    subject: string,
  ): Promise<void> {
    await this.prisma.AuthIdentity.create({
      userId,
      provider,
      providerSubject: subject,
    });
  }

  async markUserVerified(userId: string, now: string): Promise<void> {
    await this.prisma.User.where({ id: userId })
      .where((user) => user.verifiedAt.isNull())
      .update({ verifiedAt: now });
  }
}

@Injectable()
export class AuthIdentityRepository extends PrismaAuthIdentityStore {
  constructor() {
    super(db.orm.public);
  }

  transaction<TResult>(
    operation: (store: AuthIdentityStore) => Promise<TResult>,
  ): Promise<TResult> {
    return db.transaction((transaction) =>
      operation(new PrismaAuthIdentityStore(transaction.orm.public)),
    );
  }
}
