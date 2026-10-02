#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/01efed2bcc43ce716f0c8be6301e57ad3efafb638a4fead5d5df639f86a6c2fd/contract';
import endContract from '../../snapshots/01efed2bcc43ce716f0c8be6301e57ad3efafb638a4fead5d5df639f86a6c2fd/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/df4860660af55be2b957682ec6522e5d82ef668ec2b3ebf3ac1cd561f1ca7cc2/contract';
import startContract from '../../snapshots/df4860660af55be2b957682ec6522e5d82ef668ec2b3ebf3ac1cd561f1ca7cc2/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'authIdentity',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('providerSubject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('authIdentity_provider_check_ced8a431', '"provider" IN (\'GOOGLE\')'),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'authIdentity',
        constraint: 'authIdentity_provider_providerSubject_key',
        columns: ['provider', 'providerSubject'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'authIdentity',
        constraint: 'authIdentity_userId_provider_key',
        columns: ['userId', 'provider'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'authIdentity',
        index: 'authIdentity_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'authIdentity',
        foreignKey: {
          name: 'auth_identity_user_id_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
