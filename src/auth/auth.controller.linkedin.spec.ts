import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AuthActionTokenService } from './auth-action-token.service.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { RefreshTokenCookieService } from './refresh-token-cookie.service.js';

describe('AuthController.linkedin', () => {
  it('logs in with LinkedIn, sets the refresh cookie, and returns the session', async () => {
    const loginResponse = {
      access_token: 'access-token',
      id: '00000000-0000-4000-8000-000000000001',
      email: 'person@example.com',
      role: 'TALENT',
    };
    const authService = {
      loginWithLinkedIn: vi.fn(() =>
        Promise.resolve({
          refreshToken: 'refresh-token',
          response: loginResponse,
        }),
      ),
    };
    const cookie = { write: vi.fn() };
    const controller = new AuthController(
      authService as unknown as AuthService,
      {} as AuthActionTokenService,
      cookie as unknown as RefreshTokenCookieService,
    );
    const response = {} as Response;
    const dto = {
      code: 'auth-code',
      redirectUri: 'http://localhost:3000/auth/linkedin/callback',
    };

    await expect(controller.linkedin(dto, response)).resolves.toBe(
      loginResponse,
    );
    expect(authService.loginWithLinkedIn).toHaveBeenCalledWith(dto);
    expect(cookie.write).toHaveBeenCalledWith(response, 'refresh-token');
  });
});
