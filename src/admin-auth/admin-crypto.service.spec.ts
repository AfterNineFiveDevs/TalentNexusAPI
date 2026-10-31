import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { generate } from 'otplib';
import { AdminCryptoService } from './admin-crypto.service';

const cryptoService = new AdminCryptoService(
  new ConfigService({
    ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64'),
  }),
);
afterEach(() => vi.useRealTimers());
describe('Admin authenticator and secret protection', () => {
  it('validates an RFC 6238 SHA-1 vector and rejects replay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(59_000);
    const secret = cryptoService.encrypt(
      'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      'user-one',
    );
    expect(await cryptoService.totp(secret, 'user-one', '287082', -1)).toBe(1);
    expect(
      await cryptoService.totp(secret, 'user-one', '287082', 1),
    ).toBeNull();
  });
  it('accepts the previous time step and rejects future and older steps', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const secret = cryptoService.secret();
    const encrypted = cryptoService.encrypt(secret, 'user-one');
    const epoch = Math.floor(Date.now() / 1000);
    expect(
      await cryptoService.totp(
        encrypted,
        'user-one',
        await generate({ secret, epoch: epoch - 30 }),
        -1,
      ),
    ).not.toBeNull();
    expect(
      await cryptoService.totp(
        encrypted,
        'user-one',
        await generate({ secret, epoch: epoch + 30 }),
        -1,
      ),
    ).toBeNull();
    expect(
      await cryptoService.totp(
        encrypted,
        'user-one',
        await generate({ secret, epoch: epoch - 60 }),
        -1,
      ),
    ).toBeNull();
  });
  it('binds encrypted secrets to their user and detects tampering', () => {
    const encrypted = cryptoService.encrypt('test-secret', 'user-one');
    expect(cryptoService.decrypt(encrypted, 'user-one')).toBe('test-secret');
    expect(() => cryptoService.decrypt(encrypted, 'user-two')).toThrow();
    const parts = encrypted.split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(() => cryptoService.decrypt(parts.join('.'), 'user-one')).toThrow();
  });
});
