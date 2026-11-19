import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentVariables } from '../config/environment.js';
import { LinkedinAuthService } from './linkedin-auth.service.js';

const redirectUri = 'http://localhost:3000/auth/linkedin/callback';

function createService(
  overrides: Partial<Record<string, unknown>> = {},
): LinkedinAuthService {
  const values: Record<string, unknown> = {
    LINKEDIN_CLIENT_ID: 'client-id',
    LINKEDIN_CLIENT_SECRET: 'client-secret',
    LINKEDIN_REDIRECT_URIS: [redirectUri],
    ...overrides,
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new LinkedinAuthService(config);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockLinkedIn(userInfo: unknown, tokenStatus = 200) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      jsonResponse({ access_token: 'linkedin-access-token' }, tokenStatus),
    )
    .mockResolvedValueOnce(jsonResponse(userInfo));
}

describe('LinkedinAuthService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exchanges the code and returns the verified identity', async () => {
    const fetchMock = mockLinkedIn({
      sub: 'linkedin-subject',
      email: ' Person@Example.COM ',
      email_verified: true,
      name: ' Aye Aye ',
    });

    await expect(
      createService().verify({ code: 'auth-code', redirectUri }),
    ).resolves.toEqual({
      subject: 'linkedin-subject',
      email: 'person@example.com',
      name: 'Aye Aye',
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    const body = tokenInit?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('redirect_uri')).toBe(redirectUri);
    expect(body.get('client_secret')).toBe('client-secret');

    const [userInfoUrl, userInfoInit] = fetchMock.mock.calls[1];
    expect(userInfoUrl).toBe('https://api.linkedin.com/v2/userinfo');
    expect(userInfoInit?.headers).toEqual({
      Authorization: 'Bearer linkedin-access-token',
    });
  });

  it('rejects a redirect URI that is not on the allow-list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      createService().verify({
        code: 'auth-code',
        redirectUri: 'https://evil.example.com/callback',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when LinkedIn is not configured', async () => {
    await expect(
      createService({ LINKEDIN_CLIENT_SECRET: undefined }).verify({
        code: 'auth-code',
        redirectUri,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the code exchange fails', async () => {
    mockLinkedIn({}, 400);

    await expect(
      createService().verify({ code: 'used-code', redirectUri }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unverified email', async () => {
    mockLinkedIn({
      sub: 'linkedin-subject',
      email: 'person@example.com',
      email_verified: false,
    });

    await expect(
      createService().verify({ code: 'auth-code', redirectUri }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a profile without an email', async () => {
    mockLinkedIn({ sub: 'linkedin-subject', email_verified: true });

    await expect(
      createService().verify({ code: 'auth-code', redirectUri }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
