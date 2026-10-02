#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/df4860660af55be2b957682ec6522e5d82ef668ec2b3ebf3ac1cd561f1ca7cc2/contract';
import endContract from '../../snapshots/df4860660af55be2b957682ec6522e5d82ef668ec2b3ebf3ac1cd561f1ca7cc2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f34243e7f78e6d0c9c82ec01ac61a218bcebfcf35856ca5c027d215955068651/contract';
import startContract from '../../snapshots/f34243e7f78e6d0c9c82ec01ac61a218bcebfcf35856ca5c027d215955068651/contract.json' with { type: 'json' };
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
      this.dropColumn({ schema: 'public', table: 'user', column: 'resetPasswordToken' }),
      this.dropColumn({ schema: 'public', table: 'user', column: 'resetPasswordTokenExpiry' }),
      this.dropColumn({ schema: 'public', table: 'user', column: 'verificationToken' }),
      this.createTable({
        schema: 'public',
        table: 'authActionToken',
        columns: [
          col('consumedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
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
          col('purpose', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'authActionToken_purpose_check_325330e4',
            "\"purpose\" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'authActionToken',
        constraint: 'authActionToken_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'authActionToken',
        index: 'authActionToken_expiresAt_idx_6b6b8c10',
        columns: ['expiresAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'authActionToken',
        index: 'authActionToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'authActionToken',
        index: 'authActionToken_userId_purpose_idx_e49c32f0',
        columns: ['userId', 'purpose'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'authActionToken',
        foreignKey: {
          name: 'auth_action_token_user_id_fkey',
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
