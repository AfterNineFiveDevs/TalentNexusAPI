import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const name = `talent-nexus-admin-test-${randomUUID()}`;
function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${binary} ${args[0]} failed\n${result.stderr ?? ''}\n${result.stdout ?? ''}`,
      { cause: result.error },
    );
  }
  return result.stdout?.trim() ?? '';
}

let simulation;
let simulationLog = '';
try {
  const temporary = createServer();
  await new Promise((resolve) => temporary.listen(0, '127.0.0.1', resolve));
  const simulationPort = temporary.address().port;
  await new Promise((resolve) => temporary.close(resolve));
  simulation = spawn(
    'postman',
    [
      'simulation',
      'run',
      'postman/simulations/admin-email/admin-email.sim.yaml',
      '--port',
      String(simulationPort),
      '--no-history',
      '--output',
      'ndjson',
    ],
    { cwd, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  simulation.stdout.on('data', (chunk) => {
    simulationLog += chunk.toString();
  });
  const mockUrl = `http://127.0.0.1:${simulationPort}/brevo`;
  let emailReady = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${mockUrl}/_test/messages`)).ok) {
        emailReady = true;
        break;
      }
    } catch {}
    if (simulation.exitCode !== null)
      throw new Error('Local email simulation exited before readiness');
    await delay(200);
  }
  if (!emailReady)
    throw new Error('Local email simulation did not become ready');
  run('docker', [
    'run',
    '--detach',
    '--name',
    name,
    '--publish',
    '127.0.0.1::5432',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '--env',
    'POSTGRES_USER=admin_jobs_fixture',
    '--env',
    'POSTGRES_PASSWORD=admin_jobs_fixture',
    '--env',
    'POSTGRES_DB=admin_jobs_fixture',
    'postgres:16',
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const check = spawnSync(
      'docker',
      ['exec', name, 'pg_isready', '-U', 'admin_jobs_fixture'],
      { encoding: 'utf8' },
    );
    if (check.status === 0) {
      ready = true;
      break;
    }
    await delay(200);
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready');
  const port = run('docker', ['port', name, '5432/tcp']).split(':').at(-1);
  const url = `postgresql://admin_jobs_fixture:admin_jobs_fixture@127.0.0.1:${port}/admin_jobs_fixture`;
  const env = {
    ...process.env,
    DATABASE_URL: url,
    ADMIN_JOBS_TEST_DATABASE_URL: url,
    ADMIN_EMAIL_TEST_URL: mockUrl,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'isolated-admin-auth-fixture-signing-key',
    JWT_EXPIRES_IN: '15m',
    ADMIN_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ADMIN_APP_URL: 'http://localhost:3001',
    EMAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'fixture-not-a-real-key',
    MAIL_FROM_EMAIL: 'fixture@example.com',
    BREVO_API_URL: `${mockUrl}/v3`,
  };
  run(
    './node_modules/.bin/prisma',
    ['db', 'migrate', '--db', url, '--to', '20261024T1158_add_jobs'],
    { env },
  );
  // Exercise migration backfill on an existing pre-upgrade row, not only empty tables.
  run('docker', [
    'exec',
    name,
    'psql',
    '-U',
    'admin_jobs_fixture',
    '-d',
    'admin_jobs_fixture',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO public.job (id, "sourceId", "externalId", "sourceUrl", title, "companyName", description, location, "applicationUrl", "updatedAt")
     VALUES ('${randomUUID()}', 'migration-fixture', 'before-upgrade', 'https://example.com', 'Existing job', 'Existing company', 'Existing content', 'Yangon', '{}', now())`,
  ]);
  const preUpgradeUser = randomUUID();
  run('docker', [
    'exec',
    name,
    'psql',
    '-U',
    'admin_jobs_fixture',
    '-d',
    'admin_jobs_fixture',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `INSERT INTO public."user" (id, email, "termAccepted", "updatedAt") VALUES ('${preUpgradeUser}', 'migration-user@example.com', true, now());
     INSERT INTO public."authSession" (id, "userId", "refreshTokenHash", "expiresAt", "updatedAt") VALUES ('${randomUUID()}', '${preUpgradeUser}', 'pre-upgrade-fixture-hash', now()+interval '1 day', now());`,
  ]);
  // An explicit --db prevents this test from advancing the repository's db ref.
  run(
    './node_modules/.bin/prisma',
    [
      'db',
      'migrate',
      '--db',
      url,
      '--to',
      '20261031T2023_admin_authentication',
    ],
    { env },
  );
  const preserved = run('docker', [
    'exec',
    name,
    'psql',
    '-U',
    'admin_jobs_fixture',
    '-d',
    'admin_jobs_fixture',
    '-At',
    '-c',
    `SELECT count(*) FROM public.job WHERE "externalId"='before-upgrade' AND version=0 AND "deletedAt" IS NULL AND "adminEditedAt" IS NULL AND description='Existing content'`,
  ]);
  assert.equal(
    preserved,
    '1',
    'Migration must preserve the existing job and initialize version zero',
  );
  const preservedSession = run('docker', [
    'exec',
    name,
    'psql',
    '-U',
    'admin_jobs_fixture',
    '-d',
    'admin_jobs_fixture',
    '-At',
    '-c',
    `SELECT count(*) FROM public."authSession" WHERE "userId"='${preUpgradeUser}' AND purpose='USER' AND "mfaVerifiedAt" IS NULL AND "absoluteExpiresAt" IS NULL`,
  ]);
  assert.equal(
    preservedSession,
    '1',
    'Migration must preserve existing ordinary sessions without MFA assurance',
  );
  run('./node_modules/.bin/nest', ['build'], { env });
  const cliOutput = run(
    'node',
    [
      'scripts/admin-access.mjs',
      'bootstrap',
      'cli@example.com',
      'CLI Bootstrap',
      '--confirm-access-change',
    ],
    { env },
  );
  assert.ok(cliOutput.includes('accepted by the email provider'));
  assert.ok(!cliOutput.includes('#token='));
  run(
    './node_modules/.bin/vitest',
    ['run', '--config', 'vitest.admin-jobs.config.ts'],
    { env, stdio: 'inherit' },
  );
  await delay(100);
  const requests = simulationLog
    .split('\n')
    .filter((line) => line.includes('"event":"request"'));
  assert.ok(
    requests.length > 0,
    'Simulation log must show actual intercepted HTTP calls',
  );
  console.log(
    `Local email simulation recorded ${requests.length} HTTP requests; operator bootstrap passed.`,
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  simulation?.kill('SIGINT');
  // The random container belongs only to this invocation and holds disposable fixtures.
  spawnSync('docker', ['rm', '--force', name], { stdio: 'ignore' });
}
