import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';

@Injectable()
export class AdminCryptoService {
  private readonly key: Buffer;
  constructor(config: ConfigService) {
    this.key = Buffer.from(
      config.getOrThrow<string>('ADMIN_MFA_ENCRYPTION_KEY'),
      'base64',
    );
    if (this.key.length !== 32)
      throw new Error('ADMIN_MFA_ENCRYPTION_KEY must encode 32 bytes');
  }
  token() {
    return randomBytes(32).toString('base64url');
  }
  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  matches(value: string, hash: string) {
    const candidate = Buffer.from(this.hash(value), 'hex');
    const expected = Buffer.from(hash, 'hex');
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  }
  secret() {
    return generateSecret();
  }
  uri(secret: string, email: string) {
    return generateURI({
      issuer: 'TalentNexus Admin',
      label: email,
      secret,
      algorithm: 'sha1',
      digits: 6,
      period: 30,
    });
  }
  encrypt(secret: string, userId: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(userId));
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((v) => v.toString('base64url'))
      .join('.');
  }
  decrypt(value: string, userId: string) {
    const [iv, tag, ciphertext] = value
      .split('.')
      .map((v) => Buffer.from(v, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
  async totp(
    secretCiphertext: string,
    userId: string,
    code: string,
    afterTimeStep: number,
  ) {
    const result = await verify({
      secret: this.decrypt(secretCiphertext, userId),
      token: code,
      algorithm: 'sha1',
      digits: 6,
      period: 30,
      epochTolerance: [30, 0],
      ...(afterTimeStep >= 0 ? { afterTimeStep } : {}),
    });
    return result.valid && 'timeStep' in result ? result.timeStep : null;
  }
  recoveryCode() {
    return randomBytes(16).toString('hex').match(/.{4}/g)!.join('-');
  }
  normalizeCode(value: string) {
    return value.replaceAll('-', '').replaceAll(' ', '').toLowerCase();
  }
}
