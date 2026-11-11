import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

const staging = {
  ENVIRONMENT: 'staging',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'x'.repeat(32),
  JWT_EXPIRES_IN: '15m',
  ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  ADMIN_APP_URL: 'http://localhost:5173',
  WEB_APP_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000,http://localhost:5173',
  GOOGLE_CLIENT_IDS: 'fixture.apps.googleusercontent.com',
  EMAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'fixture-key',
  MAIL_FROM_EMAIL: 'test@example.com',
};

describe('Staging frontend URL validation', () => {
  it('accepts HTTP localhost frontends with the staging opt-in', () => {
    expect(
      validateEnvironment({ ...staging, STAGING_ALLOW_LOCALHOST: 'true' }),
    ).toMatchObject({
      ADMIN_APP_URL: staging.ADMIN_APP_URL,
      WEB_APP_URL: staging.WEB_APP_URL,
    });
  });

  it('requires HTTPS in staging by default and in production even with the opt-in', () => {
    expect(() => validateEnvironment(staging)).toThrow('ADMIN_APP_URL');
    expect(() =>
      validateEnvironment({
        ...staging,
        ENVIRONMENT: 'production',
        STAGING_ALLOW_LOCALHOST: 'true',
      }),
    ).toThrow('WEB_APP_URL');
  });

  it('rejects HTTP URLs whose actual hostname is outside loopback', () => {
    expect(() =>
      validateEnvironment({
        ...staging,
        STAGING_ALLOW_LOCALHOST: 'true',
        ADMIN_APP_URL: 'http://localhost@admin.example.com:5173',
      }),
    ).toThrow('ADMIN_APP_URL');
  });

  it('still requires the hosted Brevo endpoint with the staging opt-in', () => {
    expect(() =>
      validateEnvironment({
        ...staging,
        STAGING_ALLOW_LOCALHOST: 'true',
        BREVO_API_URL: 'http://localhost:4010',
      }),
    ).toThrow('BREVO_API_URL');
  });
});
