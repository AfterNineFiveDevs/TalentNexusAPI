#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/bae8dddd7198ed6cad3ede8060b268be4b802ee7ceaa2347145ffe6960391dd3/contract';
import startContract from '../../snapshots/bae8dddd7198ed6cad3ede8060b268be4b802ee7ceaa2347145ffe6960391dd3/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cc4e51f6795be8105e9f5a44f799d8de36cbf50a61c52e637550d5fbf107b435/contract';
import endContract from '../../snapshots/cc4e51f6795be8105e9f5a44f799d8de36cbf50a61c52e637550d5fbf107b435/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'adminAuthAttempt',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('windowStartedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['key'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'adminChallenge',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
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
          col('secretCiphertext', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('admin_challenge_purpose_3a593c12', "purpose IN ('ENROLL', 'VERIFY')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'adminInvitation',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('createdById', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lastSentAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('state', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'admin_invitation_state_9222fa24',
            "state IN ('PENDING', 'ONBOARDING', 'ACCEPTED', 'REVOKED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'adminMembership',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('lastTotpStep', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('originalRole', 'text', {
            notNull: true,
            default: lit('TALENT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('secretCiphertext', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('state', 'text', {
            notNull: true,
            default: lit('ONBOARDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['userId']),
          checkExpression(
            'adminMembership_originalRole_check_8c8390d7',
            "\"originalRole\" IN ('TALENT', 'RECRUITER', 'ADMIN')",
          ),
          checkExpression(
            'admin_membership_state_50c5a64c',
            "state IN ('ONBOARDING', 'ACTIVE', 'DISABLED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'adminRecoveryCode',
        columns: [
          col('codeHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('consumedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'authSession',
        column: col('absoluteExpiresAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'authSession',
        column: col('mfaVerifiedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'authSession',
        column: col('purpose', 'text', {
          notNull: true,
          default: lit('USER'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'adminChallenge',
        constraint: 'adminChallenge_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'adminInvitation',
        constraint: 'adminInvitation_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'adminInvitation',
        constraint: 'adminInvitation_tokenHash_key',
        columns: ['tokenHash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'adminRecoveryCode',
        constraint: 'adminRecoveryCode_codeHash_key',
        columns: ['codeHash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'adminChallenge',
        index: 'adminChallenge_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'adminRecoveryCode',
        index: 'adminRecoveryCode_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'adminChallenge',
        foreignKey: {
          name: 'adminChallenge_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'adminMembership',
        foreignKey: {
          name: 'adminMembership_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'adminRecoveryCode',
        foreignKey: {
          name: 'adminRecoveryCode_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
