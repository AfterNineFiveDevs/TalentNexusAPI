#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/bedb0f3206741043fbd7db9a0d5533bf4b173ed41f485fc70944c12a71d8ef1c/contract';
import endContract from '../../snapshots/bedb0f3206741043fbd7db9a0d5533bf4b173ed41f485fc70944c12a71d8ef1c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'cv',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('file', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'profile',
        columns: [
          col('bio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('photo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('userId', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'user',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resetPasswordToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('resetPasswordTokenExpiry', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('role', 'text', {
            notNull: true,
            default: lit('TALENT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('signUpMethod', 'text', {
            notNull: true,
            default: lit('EMAIL'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('termAccepted', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('verificationToken', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('verifiedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'user_role_check_d98424fe',
            "\"role\" IN ('TALENT', 'RECRUITER', 'ADMIN')",
          ),
          checkExpression(
            'user_signUpMethod_check_41e3d7d8',
            "\"signUpMethod\" IN ('EMAIL', 'GOOGLE', 'LinkedIn')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'profile',
        constraint: 'profile_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user',
        constraint: 'user_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cv',
        index: 'cv_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cv',
        foreignKey: {
          name: 'cv_user_id_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'profile',
        foreignKey: {
          name: 'profile_user_id_fkey',
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
