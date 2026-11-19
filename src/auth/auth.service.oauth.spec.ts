import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { API_ERROR_MESSAGES } from '@talent-nexus/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { UsersService } from '../users/users.service.js';
import type { AuthActionTokenService } from './auth-action-token.service.js';
import type {
  AuthIdentityRepository,
  AuthIdentityStore,
  OAuthProvider,
  StoredOAuthIdentity,
} from './auth-identity.repository.js';
import { AuthService } from './auth.service.js';
import type {
  GoogleAuthService,
  VerifiedOAuthIdentity,
} from './google-auth.service.js';
import type { LinkedinAuthService } from './linkedin-auth.service.js';
import type { RefreshTokenService } from './refresh-token.service.js';

type StoredUser = StoredOAuthIdentity['user'];

/** Small in-memory copy of the user and authIdentity tables. */
class FakeIdentityStore implements AuthIdentityStore {
  users: (StoredUser & { signUpMethod?: string })[] = [];
  identities: { provider: OAuthProvider; userId: string; subject: string }[] =
    [];

  findIdentity(provider: OAuthProvider, subject: string) {
    const identity = this.identities.find(
      (row) => row.provider === provider && row.subject === subject,
    );
    return Promise.resolve(identity ? this.toStored(identity) : null);
  }

  findIdentityByUserId(provider: OAuthProvider, userId: string) {
    const identity = this.identities.find(
      (row) => row.provider === provider && row.userId === userId,
    );
    return Promise.resolve(identity ? this.toStored(identity) : null);
  }

  findUserByEmail(email: string) {
    return Promise.resolve(
      this.users.find((user) => user.email === email) ?? null,
    );
  }

  createOAuthUser(input: {
    provider: OAuthProvider;
    email: string;
    name?: string;
    now: string;
  }) {
    const user = {
      id: `00000000-0000-4000-8000-00000000000${this.users.length + 1}`,
      email: input.email,
      role: 'TALENT' as const,
      name: input.name ?? null,
      verifiedAt: input.now,
      signUpMethod: input.provider === 'LINKEDIN' ? 'LinkedIn' : 'GOOGLE',
    };
    this.users.push(user);
    return Promise.resolve(user);
  }

  createIdentity(provider: OAuthProvider, userId: string, subject: string) {
    this.identities.push({ provider, userId, subject });
    return Promise.resolve();
  }

  markUserVerified(userId: string, now: string) {
    const user = this.users.find((row) => row.id === userId);
    if (user && !user.verifiedAt) user.verifiedAt = now;
    return Promise.resolve();
  }

  transaction<T>(operation: (store: AuthIdentityStore) => Promise<T>) {
    return operation(this);
  }

  private toStored(identity: {
    userId: string;
    subject: string;
  }): StoredOAuthIdentity {
    const user = this.users.find((row) => row.id === identity.userId)!;
    return {
      id: `identity-${identity.subject}`,
      userId: identity.userId,
      providerSubject: identity.subject,
      user,
    };
  }
}

const linkedinIdentity: VerifiedOAuthIdentity = {
  subject: 'linkedin-subject',
  email: 'person@example.com',
  name: 'Aye Aye',
};

function setup(identity: VerifiedOAuthIdentity | Error = linkedinIdentity) {
  const store = new FakeIdentityStore();
  const linkedinAuth = {
    verify: vi.fn(() =>
      identity instanceof Error
        ? Promise.reject(identity)
        : Promise.resolve(identity),
    ),
  };
  const service = new AuthService(
    {} as UsersService,
    { sign: vi.fn(() => 'access-token') } as unknown as JwtService,
    {
      create: vi.fn(() => Promise.resolve('refresh-token')),
    } as unknown as RefreshTokenService,
    {} as AuthActionTokenService,
    {} as GoogleAuthService,
    linkedinAuth as unknown as LinkedinAuthService,
    store as unknown as AuthIdentityRepository,
  );
  return { service, store, linkedinAuth };
}

const dto = {
  code: 'auth-code',
  redirectUri: 'http://localhost:3000/auth/linkedin/callback',
};

describe('AuthService.loginWithLinkedIn', () => {
  it('creates a new verified TALENT user on first login', async () => {
    const { service, store, linkedinAuth } = setup();

    const session = await service.loginWithLinkedIn(dto);

    expect(linkedinAuth.verify).toHaveBeenCalledWith(dto);
    expect(session.refreshToken).toBe('refresh-token');
    expect(session.response).toMatchObject({
      access_token: 'access-token',
      email: 'person@example.com',
      role: 'TALENT',
    });
    expect(store.users[0]).toMatchObject({
      email: 'person@example.com',
      name: 'Aye Aye',
      signUpMethod: 'LinkedIn',
    });
    expect(store.identities).toEqual([
      {
        provider: 'LINKEDIN',
        userId: '00000000-0000-4000-8000-000000000001',
        subject: 'linkedin-subject',
      },
    ]);
  });

  it('logs in an already linked LinkedIn identity', async () => {
    const { service, store } = setup();
    await service.loginWithLinkedIn(dto);

    const session = await service.loginWithLinkedIn(dto);

    expect(session.response).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
    });
    expect(store.users).toHaveLength(1);
    expect(store.identities).toHaveLength(1);
  });

  it('links LinkedIn to an existing email user and marks them verified', async () => {
    const { service, store } = setup();
    store.users.push({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'person@example.com',
      role: 'TALENT',
      name: null,
      verifiedAt: null,
    });

    const session = await service.loginWithLinkedIn(dto);

    expect(session.response).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
    });
    expect(store.identities).toEqual([
      {
        provider: 'LINKEDIN',
        userId: '11111111-1111-4111-8111-111111111111',
        subject: 'linkedin-subject',
      },
    ]);
    expect(store.users[0].verifiedAt).not.toBeNull();
  });

  it('keeps a Google link and a LinkedIn link on the same user', async () => {
    const { service, store } = setup();
    store.users.push({
      id: '22222222-2222-4222-8222-222222222222',
      email: 'person@example.com',
      role: 'TALENT',
      name: null,
      verifiedAt: '2026-01-01T00:00:00.000Z',
    });
    store.identities.push({
      provider: 'GOOGLE',
      userId: '22222222-2222-4222-8222-222222222222',
      subject: 'google-subject',
    });

    await service.loginWithLinkedIn(dto);

    expect(store.identities.map((row) => row.provider)).toEqual([
      'GOOGLE',
      'LINKEDIN',
    ]);
  });

  it('rejects when the email user already has a different LinkedIn account', async () => {
    const { service, store } = setup();
    store.users.push({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'person@example.com',
      role: 'TALENT',
      name: null,
      verifiedAt: null,
    });
    store.identities.push({
      provider: 'LINKEDIN',
      userId: '11111111-1111-4111-8111-111111111111',
      subject: 'other-linkedin-subject',
    });

    await expect(service.loginWithLinkedIn(dto)).rejects.toThrow(
      new ConflictException(API_ERROR_MESSAGES.LINKEDIN_ACCOUNT_LINK_CONFLICT),
    );
  });

  it('passes through an invalid LinkedIn code error', async () => {
    const { service, store } = setup(
      new UnauthorizedException(API_ERROR_MESSAGES.LINKEDIN_AUTH_INVALID),
    );

    await expect(service.loginWithLinkedIn(dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(store.users).toHaveLength(0);
  });
});
