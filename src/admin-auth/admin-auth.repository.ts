import { HttpException, Injectable } from '@nestjs/common';
import { db } from '../prisma/db';
import type { Models } from '../prisma/contract.d';

type Row<T> = Omit<T, 'user'>;
export type Membership = Row<Models.public_AdminMembership>;
export type Invitation = Models.public_AdminInvitation;
export type Challenge = Row<Models.public_AdminChallenge>;
export type Session = Row<Models.public_AuthSession>;
type UserRole = 'TALENT' | 'RECRUITER' | 'ADMIN';

/** Queries only. All policy and credential verification live in the service. */
export class AdminAuthStore {
  constructor(private readonly orm: typeof db.orm.public) {}
  userByEmail(email: string) {
    return this.orm.User.where({ email }).first();
  }
  userById(id: string) {
    return this.orm.User.where({ id }).first();
  }
  createUser(email: string, name: string, password: string) {
    return this.orm.User.create({
      email,
      name,
      password,
      role: 'TALENT',
      termAccepted: true,
      signUpMethod: 'EMAIL',
      verifiedAt: new Date().toISOString(),
    });
  }
  setRole(id: string, role: UserRole) {
    return this.orm.User.where({ id }).update({ role });
  }
  verifyUser(id: string) {
    return this.orm.User.where({ id }).update({
      verifiedAt: new Date().toISOString(),
    });
  }
  membership(userId: string) {
    return this.orm.AdminMembership.where({ userId }).first();
  }
  createMembership(userId: string, originalRole: UserRole) {
    return this.orm.AdminMembership.create({ userId, originalRole });
  }
  updateMembership(
    userId: string,
    values: Partial<
      Pick<Membership, 'state' | 'secretCiphertext' | 'lastTotpStep'>
    >,
  ) {
    return this.orm.AdminMembership.where({ userId }).update(values);
  }
  activeMembers() {
    return this.orm.AdminMembership.where({ state: 'ACTIVE' })
      .select('userId')
      .all();
  }
  async listMembers(page: number, limit: number) {
    const data = await this.orm.AdminMembership.select(
      'userId',
      'state',
      'createdAt',
    )
      .include('user', (u) => u.select('email', 'name'))
      .orderBy([(m) => m.createdAt.desc(), (m) => m.userId.asc()])
      .offset((page - 1) * limit)
      .limit(limit)
      .all();
    const total = await this.orm.AdminMembership.aggregate((a) => ({
      count: a.count(),
    }));
    return {
      data: data.map((m) => ({
        userId: m.userId,
        state: m.state,
        createdAt: m.createdAt,
        email: m.user!.email,
        name: m.user!.name,
        mfaEnabled: m.state === 'ACTIVE',
      })),
      total: total.count,
    };
  }
  invitationByEmail(email: string) {
    return this.orm.AdminInvitation.where({ email }).first();
  }
  invitationById(id: string) {
    return this.orm.AdminInvitation.where({ id }).first();
  }
  invitationByHash(tokenHash: string) {
    return this.orm.AdminInvitation.where({ tokenHash }).first();
  }
  createInvitation(
    input: Pick<
      Invitation,
      'email' | 'name' | 'tokenHash' | 'expiresAt' | 'createdById'
    >,
  ) {
    return this.orm.AdminInvitation.create(input);
  }
  updateInvitation(
    id: string,
    input: Partial<
      Pick<
        Invitation,
        | 'state'
        | 'tokenHash'
        | 'expiresAt'
        | 'lastSentAt'
        | 'userId'
        | 'name'
        | 'createdById'
      >
    >,
  ) {
    return this.orm.AdminInvitation.where({ id }).update(input);
  }
  async listInvitations(page: number, limit: number) {
    const data = await this.orm.AdminInvitation.select(
      'id',
      'email',
      'name',
      'state',
      'expiresAt',
      'createdAt',
    )
      .orderBy([(i) => i.createdAt.desc(), (i) => i.id.asc()])
      .offset((page - 1) * limit)
      .limit(limit)
      .all();
    const total = await this.orm.AdminInvitation.aggregate((a) => ({
      count: a.count(),
    }));
    return { data, total: total.count };
  }
  createChallenge(
    input: Pick<Challenge, 'userId' | 'purpose' | 'tokenHash' | 'expiresAt'>,
  ) {
    return this.orm.AdminChallenge.create(input);
  }
  challenge(tokenHash: string) {
    return this.orm.AdminChallenge.where({ tokenHash }).first();
  }
  updateChallenge(
    id: string,
    input: Partial<
      Pick<Challenge, 'attempts' | 'consumedAt' | 'secretCiphertext'>
    >,
  ) {
    return this.orm.AdminChallenge.where({ id }).update(input);
  }
  invalidateChallenges(userId: string) {
    return this.orm.AdminChallenge.where({ userId })
      .where((c) => c.consumedAt.isNull())
      .updateAndCount({
        consumedAt: new Date().toISOString(),
        secretCiphertext: null,
      });
  }
  attempt(key: string) {
    return this.orm.AdminAuthAttempt.where({ key }).first();
  }
  createAttempt(key: string, attempts: number, windowStartedAt: string) {
    return this.orm.AdminAuthAttempt.create({ key, attempts, windowStartedAt });
  }
  updateAttempt(key: string, attempts: number, windowStartedAt: string) {
    return this.orm.AdminAuthAttempt.where({ key }).update({
      attempts,
      windowStartedAt,
    });
  }
  clearCodes(userId: string) {
    return this.orm.AdminRecoveryCode.where({ userId }).deleteAndCount();
  }
  createCode(userId: string, codeHash: string) {
    return this.orm.AdminRecoveryCode.create({ userId, codeHash });
  }
  recoveryCode(userId: string, codeHash: string) {
    return this.orm.AdminRecoveryCode.where({ userId, codeHash })
      .where((c) => c.consumedAt.isNull())
      .first();
  }
  consumeCode(id: string) {
    return this.orm.AdminRecoveryCode.where({ id }).update({
      consumedAt: new Date().toISOString(),
    });
  }
  createSession(
    input: Pick<
      Session,
      | 'id'
      | 'userId'
      | 'refreshTokenHash'
      | 'expiresAt'
      | 'absoluteExpiresAt'
      | 'mfaVerifiedAt'
    >,
  ) {
    return this.orm.AuthSession.create({ ...input, purpose: 'ADMIN' });
  }
  session(id: string) {
    return this.orm.AuthSession.where({ id }).first();
  }
  rotateSession(id: string, refreshTokenHash: string) {
    return this.orm.AuthSession.where({ id }).update({
      refreshTokenHash,
      lastRotatedAt: new Date().toISOString(),
    });
  }
  revokeSession(
    id: string,
    reason: 'LOGOUT' | 'LOGOUT_ALL' | 'TOKEN_REUSE' = 'LOGOUT',
  ) {
    return this.orm.AuthSession.where({ id })
      .where((s) => s.revokedAt.isNull())
      .updateAndCount({
        revokedAt: new Date().toISOString(),
        revocationReason: reason,
      });
  }
  revokeSessions(userId: string) {
    return this.orm.AuthSession.where({ userId })
      .where((s) => s.revokedAt.isNull())
      .updateAndCount({
        revokedAt: new Date().toISOString(),
        revocationReason: 'LOGOUT_ALL',
      });
  }
}

@Injectable()
export class AdminAuthRepository extends AdminAuthStore {
  constructor() {
    super(db.orm.public);
  }
  /** A transaction-scoped advisory lock serializes the low-volume admin control
   * plane across instances, including first/last-admin and credential replay races.
   * Expected HTTP failures commit attempt counters; unexpected failures roll back. */
  async locked<T>(
    operation: (store: AdminAuthStore) => Promise<T>,
  ): Promise<T> {
    const result = await db.transaction(async (tx) => {
      const lock = db.raw
        .sql`SELECT pg_advisory_xact_lock(1846532101)::text AS locked`
        .returnsRow({ locked: 'pg/text@1' })
        .build();
      await tx.query(lock);
      try {
        return {
          ok: true as const,
          value: await operation(new AdminAuthStore(tx.orm.public)),
        };
      } catch (error) {
        if (error instanceof HttpException)
          return { ok: false as const, error };
        throw error;
      }
    });
    if (!result.ok) throw result.error;
    return result.value;
  }
}
