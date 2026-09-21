import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

// The runtime package does not expose a resolvable type to the linter.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});
