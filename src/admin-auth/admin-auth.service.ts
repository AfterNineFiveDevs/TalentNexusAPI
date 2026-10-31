import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  Role,
  adminPasswordSchema,
  type AdminAcceptInvitation,
  type AdminInvite,
  type AdminReauthenticate,
} from '@talent-nexus/contracts';
import {
  AdminAuthRepository,
  AdminAuthStore,
  type Challenge,
  type Invitation,
  type Membership,
  type Session,
} from './admin-auth.repository';
import { AdminCryptoService } from './admin-crypto.service';
import { AdminEmailService } from './admin-email.service';

export interface AdminPrincipal {
  id: string;
  email: string;
  role: Role.Admin;
  adminSessionId: string;
}
const now = () => new Date().toISOString();
const after = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();
const expired = (date: string) => new Date(date).getTime() <= Date.now();
const invalid = () =>
  new UnauthorizedException('Invalid or expired admin credentials');

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly repository: AdminAuthRepository,
    private readonly crypto: AdminCryptoService,
    private readonly jwt: JwtService,
    private readonly email: AdminEmailService,
  ) {}

  async login(email: string, password: string) {
    return this.repository.locked(async (store) => {
      await this.limit(store, `login:${email}`, 10);
      const user = await store.userByEmail(email);
      const member = user && (await store.membership(user.id));
      // A fixed valid hash keeps unknown-account password verification on the same path.
      const passwordMatches = await bcrypt.compare(
        password,
        user?.password ??
          '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      );
      if (!user || !member || member.state === 'DISABLED' || !passwordMatches)
        throw invalid();
      if (member.state === 'ACTIVE' && user.role !== 'ADMIN') throw invalid();
      if (member.state === 'ONBOARDING')
        await this.onboardingInvitation(store, user.id, user.email);
      return this.challenge(
        store,
        user.id,
        member.state === 'ACTIVE' ? 'VERIFY' : 'ENROLL',
      );
    });
  }

  enrollment(challengeToken: string) {
    return this.repository.locked(async (store) => {
      const { challenge, user } = await this.validateChallenge(
        store,
        challengeToken,
        'ENROLL',
      );
      let ciphertext = challenge.secretCiphertext;
      if (!ciphertext) {
        ciphertext = this.crypto.encrypt(this.crypto.secret(), user.id);
        await store.updateChallenge(challenge.id, {
          secretCiphertext: ciphertext,
        });
      }
      const secret = this.crypto.decrypt(ciphertext, user.id);
      return { secret, otpauthUri: this.crypto.uri(secret, user.email) };
    });
  }

  confirmEnrollment(challengeToken: string, code: string) {
    return this.repository.locked(async (store) => {
      const { challenge, member, user } = await this.validateChallenge(
        store,
        challengeToken,
        'ENROLL',
      );
      if (!challenge.secretCiphertext)
        throw new BadRequestException('Start MFA enrollment first');
      await this.attemptChallenge(store, challenge);
      const step = await this.crypto.totp(
        challenge.secretCiphertext,
        user.id,
        code,
        -1,
      );
      if (step === null) throw invalid();
      const invitation = await this.onboardingInvitation(
        store,
        user.id,
        user.email,
      );
      await store.updateMembership(member.userId, {
        state: 'ACTIVE',
        secretCiphertext: challenge.secretCiphertext,
        lastTotpStep: step,
      });
      await store.setRole(user.id, 'ADMIN');
      await store.verifyUser(user.id);
      await store.updateInvitation(invitation.id, { state: 'ACCEPTED' });
      await store.invalidateChallenges(user.id);
      await store.revokeSessions(user.id);
      const recoveryCodes = await this.replaceCodes(store, user.id);
      const session = await this.issueSession(store, {
        ...user,
        role: 'ADMIN',
      });
      return { ...session, response: { ...session.response, recoveryCodes } };
    });
  }

  verify(
    challengeToken: string,
    proof: { code?: string; recoveryCode?: string },
  ) {
    return this.repository.locked(async (store) => {
      const { challenge, member, user } = await this.validateChallenge(
        store,
        challengeToken,
        'VERIFY',
      );
      await this.attemptChallenge(store, challenge);
      await this.checkProof(store, member, proof);
      await store.updateChallenge(challenge.id, { consumedAt: now() });
      return this.issueSession(store, user);
    });
  }

  async refresh(raw: string | undefined) {
    return this.repository.locked(async (store) => {
      const parsed = this.parseRefresh(raw);
      if (!parsed) throw invalid();
      const session = await store.session(parsed.id);
      if (!session || session.purpose !== 'ADMIN') throw invalid();
      if (!this.crypto.matches(parsed.secret, session.refreshTokenHash)) {
        await store.revokeSession(session.id, 'TOKEN_REUSE');
        throw invalid();
      }
      const user = await this.sessionUser(store, session);
      const secret = this.crypto.token();
      await store.rotateSession(session.id, this.crypto.hash(secret));
      return {
        refreshToken: `${session.id}.${secret}`,
        response: this.accessResponse(user, session),
      };
    });
  }

  async authorize(userId: string, sessionId: string): Promise<AdminPrincipal> {
    const session = await this.repository.session(sessionId);
    if (!session || session.userId !== userId) throw invalid();
    const user = await this.sessionUser(this.repository, session);
    return {
      id: user.id,
      email: user.email,
      role: Role.Admin,
      adminSessionId: session.id,
    };
  }

  async profile(principal: AdminPrincipal) {
    const user = await this.repository.userById(principal.id);
    if (!user) throw invalid();
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'ADMIN' as const,
      mfaEnabled: true as const,
    };
  }

  logout(raw: string | undefined) {
    return this.repository.locked(async (store) => {
      const parsed = this.parseRefresh(raw);
      const session = parsed && (await store.session(parsed.id));
      if (
        session &&
        session.purpose === 'ADMIN' &&
        this.crypto.matches(parsed.secret, session.refreshTokenHash)
      )
        await store.revokeSession(session.id);
    });
  }
  logoutAll(actor: AdminPrincipal) {
    return this.repository.locked(async (store) => {
      await this.requireActor(store, actor);
      await store.revokeSessions(actor.id);
      await store.invalidateChallenges(actor.id);
    });
  }
  regenerateCodes(actor: AdminPrincipal, proof: AdminReauthenticate) {
    return this.repository.locked(async (store) => {
      const { user, member } = await this.requireActor(store, actor);
      await this.limit(store, `reauth:${user.id}`, 5);
      if (
        !user.password ||
        !(await bcrypt.compare(proof.password, user.password))
      )
        throw invalid();
      await this.checkProof(store, member, proof);
      return { recoveryCodes: await this.replaceCodes(store, user.id) };
    });
  }

  async invite(actor: AdminPrincipal, input: AdminInvite) {
    const prepared = await this.repository.locked(async (store) => {
      await this.requireActor(store, actor);
      return this.prepareInvitation(store, input, actor.id);
    });
    return this.deliver(prepared);
  }
  async resend(actor: AdminPrincipal, id: string) {
    const prepared = await this.repository.locked(async (store) => {
      await this.requireActor(store, actor);
      const invitation = await store.invitationById(id);
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (!['PENDING', 'ONBOARDING'].includes(invitation.state))
        throw new ConflictException('Invitation is not pending');
      if (Date.now() - new Date(invitation.lastSentAt).getTime() < 60_000)
        throw new HttpException('Wait before resending this invitation', 429);
      return this.prepareInvitation(
        store,
        { email: invitation.email, name: invitation.name },
        actor.id,
        true,
      );
    });
    return this.deliver(prepared);
  }
  revokeInvitation(actor: AdminPrincipal, id: string) {
    return this.repository.locked(async (store) => {
      await this.requireActor(store, actor);
      const invitation = await store.invitationById(id);
      if (!invitation) throw new NotFoundException('Invitation not found');
      if (!['PENDING', 'ONBOARDING'].includes(invitation.state))
        throw new ConflictException('Invitation is not pending');
      if (invitation.userId)
        await store.invalidateChallenges(invitation.userId);
      await store.updateInvitation(id, {
        state: 'REVOKED',
        tokenHash: this.crypto.hash(this.crypto.token()),
      });
    });
  }
  inspectInvitation(token: string) {
    return this.repository.locked(async (store) => {
      const invitation = await this.pendingInvitation(store, token);
      return {
        email: invitation.email,
        name: invitation.name,
        expiresAt: new Date(invitation.expiresAt).toISOString(),
        existingAccount: Boolean(await store.userByEmail(invitation.email)),
      };
    });
  }
  acceptInvitation(input: AdminAcceptInvitation) {
    return this.repository.locked(async (store) => {
      const invitation = await this.pendingInvitation(store, input.token);
      await this.limit(store, `invite:${invitation.id}`, 5);
      let user = await store.userByEmail(invitation.email);
      const currentMember = user && (await store.membership(user.id));
      if (currentMember?.state === 'ACTIVE')
        throw new ConflictException('Account is already an administrator');
      if (user) {
        if (
          !user.password ||
          !(await bcrypt.compare(input.password, user.password))
        )
          throw invalid();
      } else {
        const password = adminPasswordSchema.safeParse(input.password);
        if (!password.success)
          throw new BadRequestException(
            password.error.issues.map((i) => i.message).join('; '),
          );
        if (input.confirmPassword !== input.password)
          throw new BadRequestException('Passwords do not match');
        user = await store.createUser(
          invitation.email,
          invitation.name,
          await bcrypt.hash(input.password, 12),
        );
      }
      if (!currentMember)
        await store.createMembership(
          user.id,
          user.role === 'ADMIN' ? 'TALENT' : user.role,
        );
      else
        await store.updateMembership(user.id, {
          state: 'ONBOARDING',
          secretCiphertext: null,
          lastTotpStep: -1,
        });
      await store.updateInvitation(invitation.id, {
        state: 'ONBOARDING',
        userId: user.id,
        tokenHash: this.crypto.hash(this.crypto.token()),
      });
      await store.invalidateChallenges(user.id);
      return this.challenge(store, user.id, 'ENROLL');
    });
  }

  async listMembers(actor: AdminPrincipal, page: number, limit: number) {
    await this.authorize(actor.id, actor.adminSessionId);
    const result = await this.repository.listMembers(page, limit);
    return {
      ...result,
      data: result.data.map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    };
  }
  async listInvitations(actor: AdminPrincipal, page: number, limit: number) {
    await this.authorize(actor.id, actor.adminSessionId);
    const result = await this.repository.listInvitations(page, limit);
    return {
      ...result,
      data: result.data.map((i) => ({
        ...i,
        createdAt: new Date(i.createdAt).toISOString(),
        expiresAt: new Date(i.expiresAt).toISOString(),
      })),
    };
  }
  disable(actor: AdminPrincipal, userId: string) {
    return this.repository.locked(async (store) => {
      await this.requireActor(store, actor);
      if (actor.id === userId)
        throw new ConflictException('Cannot disable your own admin access');
      const member = await store.membership(userId);
      if (!member || member.state !== 'ACTIVE')
        throw new NotFoundException('Active administrator not found');
      if ((await store.activeMembers()).length <= 1)
        throw new ConflictException(
          'Cannot disable the last active administrator',
        );
      await store.updateMembership(userId, {
        state: 'DISABLED',
        secretCiphertext: null,
        lastTotpStep: -1,
      });
      await store.setRole(
        userId,
        member.originalRole === 'ADMIN' ? 'TALENT' : member.originalRole,
      );
      await store.revokeSessions(userId);
      await store.invalidateChallenges(userId);
      await store.clearCodes(userId);
    });
  }

  /** Explicit operator-only entry point; never exposed as an HTTP route. */
  async operator(action: 'bootstrap' | 'recover', input: AdminInvite) {
    const prepared = await this.repository.locked(async (store) => {
      const user = await store.userByEmail(input.email);
      const member = user && (await store.membership(user.id));
      if (action === 'bootstrap' && (await store.activeMembers()).length)
        throw new ConflictException(
          'An active administrator already exists; use invitations',
        );
      if (action === 'recover') {
        if (
          !user ||
          (user.role !== 'ADMIN' &&
            member?.state !== 'ACTIVE' &&
            member?.state !== 'ONBOARDING')
        )
          throw new NotFoundException('Administrator not found');
        await store.revokeSessions(user.id);
        await store.invalidateChallenges(user.id);
        await store.clearCodes(user.id);
        if (member)
          await store.updateMembership(user.id, {
            state: 'ONBOARDING',
            secretCiphertext: null,
            lastTotpStep: -1,
          });
        else await store.createMembership(user.id, 'TALENT');
      }
      return this.prepareInvitation(store, input, null, true, true);
    });
    return this.deliver(prepared);
  }

  private async prepareInvitation(
    store: AdminAuthStore,
    input: AdminInvite,
    createdById: string | null,
    replace = false,
    operator = false,
  ) {
    const user = await store.userByEmail(input.email);
    const member = user && (await store.membership(user.id));
    if (member?.state === 'ACTIVE' && !operator)
      throw new ConflictException('Account is already an administrator');
    const existing = await store.invitationByEmail(input.email);
    if (
      existing &&
      ['PENDING', 'ONBOARDING'].includes(existing.state) &&
      !expired(existing.expiresAt) &&
      !replace
    )
      throw new ConflictException('An invitation is already pending');
    const token = this.crypto.token();
    const values = {
      ...input,
      createdById,
      tokenHash: this.crypto.hash(token),
      expiresAt: after(86_400),
    };
    const invitation = existing
      ? await store.updateInvitation(existing.id, {
          ...values,
          state: 'PENDING',
          userId: null,
          lastSentAt: now(),
        })
      : await store.createInvitation(values);
    if (user) await store.invalidateChallenges(user.id);
    return { invitation: invitation!, token };
  }
  private async deliver(prepared: { invitation: Invitation; token: string }) {
    try {
      await this.email.sendInvitation(
        prepared.invitation.email,
        prepared.token,
      );
    } catch {
      await this.repository.locked(async (store) => {
        const current = await store.invitationById(prepared.invitation.id);
        if (current?.tokenHash === prepared.invitation.tokenHash)
          await store.updateInvitation(current.id, {
            state: 'REVOKED',
            tokenHash: this.crypto.hash(this.crypto.token()),
          });
      });
      throw new ServiceUnavailableException(
        'Invitation email could not be delivered; create a new invitation to retry',
      );
    }
    const { id, email, name, state, expiresAt, createdAt } =
      prepared.invitation;
    return {
      id,
      email,
      name,
      state,
      expiresAt: new Date(expiresAt).toISOString(),
      createdAt: new Date(createdAt).toISOString(),
    };
  }
  private async pendingInvitation(store: AdminAuthStore, token: string) {
    const invitation = await store.invitationByHash(this.crypto.hash(token));
    if (
      !invitation ||
      invitation.state !== 'PENDING' ||
      expired(invitation.expiresAt)
    )
      throw new BadRequestException('Invalid or expired invitation');
    return invitation;
  }
  private async onboardingInvitation(
    store: AdminAuthStore,
    userId: string,
    email: string,
  ) {
    const invitation = await store.invitationByEmail(email);
    if (
      !invitation ||
      invitation.userId !== userId ||
      invitation.state !== 'ONBOARDING' ||
      expired(invitation.expiresAt)
    )
      throw invalid();
    return invitation;
  }
  private async challenge(
    store: AdminAuthStore,
    userId: string,
    purpose: 'ENROLL' | 'VERIFY',
  ) {
    const token = this.crypto.token();
    const expiresAt = after(600);
    await store.createChallenge({
      userId,
      purpose,
      tokenHash: this.crypto.hash(token),
      expiresAt,
    });
    return {
      nextStep:
        purpose === 'ENROLL'
          ? ('MFA_ENROLLMENT' as const)
          : ('MFA_VERIFICATION' as const),
      challengeToken: token,
      expiresAt,
    };
  }
  private async validateChallenge(
    store: AdminAuthStore,
    token: string,
    purpose: 'ENROLL' | 'VERIFY',
  ) {
    const challenge = await store.challenge(this.crypto.hash(token));
    if (
      !challenge ||
      challenge.purpose !== purpose ||
      challenge.consumedAt ||
      expired(challenge.expiresAt) ||
      challenge.attempts >= 5
    )
      throw invalid();
    const user = await store.userById(challenge.userId);
    const member = await store.membership(challenge.userId);
    if (
      !user ||
      !member ||
      member.state !== (purpose === 'ENROLL' ? 'ONBOARDING' : 'ACTIVE')
    )
      throw invalid();
    if (purpose === 'VERIFY' && user.role !== 'ADMIN') throw invalid();
    if (purpose === 'ENROLL')
      await this.onboardingInvitation(store, user.id, user.email);
    return { challenge, member, user };
  }
  private async attemptChallenge(store: AdminAuthStore, challenge: Challenge) {
    await this.limit(store, `mfa:${challenge.userId}`, 10);
    await store.updateChallenge(challenge.id, {
      attempts: challenge.attempts + 1,
    });
  }
  private async checkProof(
    store: AdminAuthStore,
    member: Membership,
    proof: { code?: string; recoveryCode?: string },
  ) {
    if (proof.recoveryCode) {
      const code = await store.recoveryCode(
        member.userId,
        this.crypto.hash(this.crypto.normalizeCode(proof.recoveryCode)),
      );
      if (!code) throw invalid();
      await store.consumeCode(code.id);
    } else {
      if (!proof.code || !member.secretCiphertext) throw invalid();
      const step = await this.crypto.totp(
        member.secretCiphertext,
        member.userId,
        proof.code,
        member.lastTotpStep,
      );
      if (step === null) throw invalid();
      await store.updateMembership(member.userId, { lastTotpStep: step });
    }
  }
  private async replaceCodes(store: AdminAuthStore, userId: string) {
    await store.clearCodes(userId);
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = this.crypto.recoveryCode();
      codes.push(code);
      await store.createCode(
        userId,
        this.crypto.hash(this.crypto.normalizeCode(code)),
      );
    }
    return codes;
  }
  private async issueSession(
    store: AdminAuthStore,
    user: { id: string; email: string; role: string },
  ) {
    const id = randomUUID();
    const secret = this.crypto.token();
    const session = await store.createSession({
      id,
      userId: user.id,
      refreshTokenHash: this.crypto.hash(secret),
      expiresAt: after(28_800),
      absoluteExpiresAt: after(28_800),
      mfaVerifiedAt: now(),
    });
    return {
      refreshToken: `${id}.${secret}`,
      response: this.accessResponse(user, session),
    };
  }
  private accessResponse(
    user: { id: string; email: string },
    session: Session,
  ) {
    return {
      id: user.id,
      email: user.email,
      role: 'ADMIN' as const,
      access_token: this.jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: 'ADMIN',
          sid: session.id,
          amr: ['pwd', 'mfa'],
          aud: 'talentnexus-admin',
        },
        { expiresIn: 900 },
      ),
      expiresIn: 900 as const,
      sessionExpiresAt: new Date(session.absoluteExpiresAt!).toISOString(),
    };
  }
  private async sessionUser(store: AdminAuthStore, session: Session) {
    if (
      session.purpose !== 'ADMIN' ||
      !session.mfaVerifiedAt ||
      session.revokedAt ||
      expired(session.expiresAt) ||
      !session.absoluteExpiresAt ||
      expired(session.absoluteExpiresAt)
    )
      throw invalid();
    const user = await store.userById(session.userId);
    const member = await store.membership(session.userId);
    if (
      !user ||
      user.role !== 'ADMIN' ||
      !member ||
      member.state !== 'ACTIVE' ||
      !member.secretCiphertext
    )
      throw invalid();
    return user;
  }
  private async requireActor(store: AdminAuthStore, actor: AdminPrincipal) {
    const session = await store.session(actor.adminSessionId);
    if (!session || session.userId !== actor.id) throw invalid();
    const user = await this.sessionUser(store, session);
    return { user, member: (await store.membership(user.id))! };
  }
  private parseRefresh(raw: string | undefined) {
    const match = raw?.match(
      /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i,
    );
    return match ? { id: match[1], secret: match[2] } : null;
  }
  private async limit(store: AdminAuthStore, key: string, maximum: number) {
    const hashedKey = this.crypto.hash(key);
    const record = await store.attempt(hashedKey);
    const started =
      record &&
      Date.now() - new Date(record.windowStartedAt).getTime() < 900_000;
    if (record && started && record.attempts >= maximum)
      throw new HttpException(
        'Too many admin authentication attempts; try again later',
        429,
      );
    if (record)
      await store.updateAttempt(
        hashedKey,
        started ? record.attempts + 1 : 1,
        started ? record.windowStartedAt : now(),
      );
    else await store.createAttempt(hashedKey, 1, now());
  }
}
