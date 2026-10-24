#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/01efed2bcc43ce716f0c8be6301e57ad3efafb638a4fead5d5df639f86a6c2fd/contract';
import startContract from '../../snapshots/01efed2bcc43ce716f0c8be6301e57ad3efafb638a4fead5d5df639f86a6c2fd/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/400e034cd7414bffdc1c1d13f47f2158e20c239ac3942839b51b6c7c011e8f1c/contract';
import endContract from '../../snapshots/400e034cd7414bffdc1c1d13f47f2158e20c239ac3942839b51b6c7c011e8f1c/contract.json' with { type: 'json' };
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
        table: 'job',
        columns: [
          col('applicationUrl', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('closedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('companyName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('externalId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('lastSeenAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('location', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('publishedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('reviewNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-string@1' } }),
          col('reviewedById', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('sourceId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'job_applicationUrl_elem_not_null_f9c0b0af',
            'array_position("applicationUrl", NULL) IS NULL',
          ),
          checkExpression(
            'job_status_check_9bea1b51',
            "\"status\" IN ('PENDING', 'PUBLISHED', 'REJECTED', 'CLOSED')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'job',
        constraint: 'job_sourceId_externalId_key',
        columns: ['sourceId', 'externalId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'job',
        index: 'job_reviewedById_idx_e2835478',
        columns: ['reviewedById'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'job',
        index: 'job_status_publishedAt_idx_4d4b1960',
        columns: ['status', 'publishedAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'job',
        foreignKey: {
          name: 'job_reviewedById_fkey',
          columns: ['reviewedById'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
