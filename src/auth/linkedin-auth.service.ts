import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_MESSAGES } from '@talent-nexus/contracts';
import { z } from 'zod';
import type { EnvironmentVariables } from '../config/environment.js';
import type { VerifiedOAuthIdentity } from './google-auth.service.js';

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const REQUEST_TIMEOUT_MS = 10_000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
});

const userInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  email_verified: z.literal(true),
  name: z.string().optional(),
});

/**
 * Turns a LinkedIn authorization code into a verified identity.
 * Uses "Sign In with LinkedIn using OpenID Connect".
 */
@Injectable()
export class LinkedinAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUris: string[];

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.clientId = config.get('LINKEDIN_CLIENT_ID', { infer: true }) ?? '';
    this.clientSecret =
      config.get('LINKEDIN_CLIENT_SECRET', { infer: true }) ?? '';
    this.redirectUris = config.get('LINKEDIN_REDIRECT_URIS', { infer: true });
  }

  async verify(input: {
    code: string;
    redirectUri: string;
  }): Promise<VerifiedOAuthIdentity> {
    try {
      if (
        !this.clientId ||
        !this.clientSecret ||
        !this.redirectUris.includes(input.redirectUri)
      ) {
        throw new Error('LinkedIn login is not configured for this redirect');
      }

      const accessToken = await this.exchangeCode(input);
      const profile = await this.fetchUserInfo(accessToken);
      const name = profile.name?.trim();

      return {
        subject: profile.sub,
        email: profile.email,
        ...(name ? { name } : {}),
      };
    } catch {
      throw new UnauthorizedException(API_ERROR_MESSAGES.LINKEDIN_AUTH_INVALID);
    }
  }

  private async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<string> {
    const response = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`LinkedIn token exchange failed: ${response.status}`);
    }
    return tokenResponseSchema.parse(await response.json()).access_token;
  }

  private async fetchUserInfo(accessToken: string) {
    const response = await fetch(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`LinkedIn userinfo failed: ${response.status}`);
    }
    return userInfoSchema.parse(await response.json());
  }
}
