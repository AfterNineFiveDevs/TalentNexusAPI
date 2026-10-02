import { Injectable } from '@nestjs/common';
import { db } from '../prisma/db.js';

const googleProvider = 'GOOGLE' as const;

interface StoredUser {
  id: string;
  email: string;
  role: 'TALENT' | 'RECRUITER' | 'ADMIN';
  name: string | null;
  verifiedAt: string | null;
}

export interface StoredGoogleIdentity {
  id: string;
  userId: string;
  providerSubject: string;
  user: StoredUser;
}

export interface AuthIdentityStore {
  findGoogleIdentity(subject: string): Promise<StoredGoogleIdentity | null>;
  findGoogleIdentityByUserId(
    userId: string,
  ): Promise<StoredGoogleIdentity | null>;
  findUserByEmail(email: string): Promise<StoredUser | null>;
  createGoogleUser(input: {
    email: string;
    name?: string;
    now: string;
  }): Promise<StoredUser>;
  createGoogleIdentity(userId: string, subject: string): Promise<void>;
  markUserVerified(userId: string, now: string): Promise<void>;
}

class PrismaAuthIdentityStore implements AuthIdentityStore {
  constructor(private readonly prisma: typeof db.orm.public) {}

  async findGoogleIdentity(
    subject: string,
  ): Promise<StoredGoogleIdentity | null> {
    const identity = await this.prisma.AuthIdentity.where({
      provider: googleProvider,
    })
      .where({ providerSubject: subject })
      .include('user', (user) =>
        user.select('id', 'email', 'role', 'name', 'verifiedAt'),
      )
      .first();
    return identity?.user ? { ...identity, user: identity.user } : null;
  }

  async findGoogleIdentityByUserId(
    userId: string,
  ): Promise<StoredGoogleIdentity | null> {
    const identity = await this.prisma.AuthIdentity.where({ userId })
      .where({ provider: googleProvider })
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

  createGoogleUser(input: { email: string; name?: string; now: string }) {
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
      signUpMethod: 'GOOGLE',
      verifiedAt: input.now,
    });
  }

  async createGoogleIdentity(userId: string, subject: string): Promise<void> {
    await this.prisma.AuthIdentity.create({
      userId,
      provider: googleProvider,
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
