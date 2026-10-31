import { defineConfig } from 'vitest/config';
import { transform } from '@swc/core';
import { fileURLToPath } from 'node:url';

// Never allow this suite to fall back to the application's Supabase URL.
const connection = process.env.ADMIN_JOBS_TEST_DATABASE_URL;
if (!connection)
  throw new Error(
    'Set ADMIN_JOBS_TEST_DATABASE_URL to an isolated localhost admin_jobs_fixture database',
  );
const target = new URL(connection);
if (
  target.hostname !== '127.0.0.1' ||
  target.pathname !== '/admin_jobs_fixture'
) {
  throw new Error('Admin job tests require 127.0.0.1/admin_jobs_fixture');
}
process.env.DATABASE_URL = connection;
Object.assign(process.env, {
  ENVIRONMENT: 'test',
  JWT_SECRET: 'isolated-admin-auth-fixture-signing-key',
  JWT_EXPIRES_IN: '15m',
  ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  ADMIN_APP_URL: 'http://localhost:3001',
  EMAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: 'fixture-not-a-real-key',
  MAIL_FROM_EMAIL: 'fixture@example.com',
  BREVO_API_URL: `${process.env.ADMIN_EMAIL_TEST_URL}/v3`,
});

export default defineConfig({
  resolve: { alias: { src: fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    {
      name: 'nest-test-metadata',
      enforce: 'pre',
      async transform(code, id) {
        if (!id.includes('/src/') || !id.endsWith('.ts')) return;
        return transform(code, {
          filename: id,
          sourceMaps: true,
          jsc: {
            target: 'es2022',
            parser: { syntax: 'typescript', decorators: true },
            transform: { legacyDecorator: true, decoratorMetadata: true },
          },
          module: { type: 'es6' },
        });
      },
    },
  ],
  test: {
    include: [
      'test/admin-jobs.integration-spec.ts',
      'test/admin-auth.integration-spec.ts',
    ],
    environment: 'node',
    fileParallelism: false,
  },
});
