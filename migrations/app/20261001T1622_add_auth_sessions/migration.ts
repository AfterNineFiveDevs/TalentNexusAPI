#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/bedb0f3206741043fbd7db9a0d5533bf4b173ed41f485fc70944c12a71d8ef1c/contract';
import startContract from '../../snapshots/bedb0f3206741043fbd7db9a0d5533bf4b173ed41f485fc70944c12a71d8ef1c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f34243e7f78e6d0c9c82ec01ac61a218bcebfcf35856ca5c027d215955068651/contract';
import endContract from '../../snapshots/f34243e7f78e6d0c9c82ec01ac61a218bcebfcf35856ca5c027d215955068651/contract.json' with { type: 'json' };
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
        table: 'authSession',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lastRotatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('refreshTokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revocationReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('revokedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'authSession_revocationReason_check_242b105f',
            "\"revocationReason\" IN ('LOGOUT', 'LOGOUT_ALL', 'TOKEN_REUSE')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'authSession',
        constraint: 'authSession_refreshTokenHash_key',
        columns: ['refreshTokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'authSession',
        index: 'authSession_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'authSession',
        index: 'authSession_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'authSession',
        foreignKey: {
          name: 'auth_session_user_id_fkey',
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
