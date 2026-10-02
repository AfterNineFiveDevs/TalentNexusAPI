import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_MESSAGES } from '@talent-nexus/contracts';
import { OAuth2Client } from 'google-auth-library';
import type { EnvironmentVariables } from '../config/environment.js';

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  name?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.audiences = config.getOrThrow('GOOGLE_CLIENT_IDS', { infer: true });
  }

  async verify(credential: string): Promise<VerifiedGoogleIdentity> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: this.audiences,
      });
      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new Error('Google token is missing required identity claims');
      }

      return {
        subject: payload.sub,
        email: payload.email.trim().toLowerCase(),
        ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      };
    } catch {
      throw new UnauthorizedException(API_ERROR_MESSAGES.GOOGLE_AUTH_INVALID);
    }
  }
}
