#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9f6790b17aceb7d8f0cbc7f188ff4d4455e76bf403466cf1354a1eab1875c8de/contract';
import startContract from '../../snapshots/9f6790b17aceb7d8f0cbc7f188ff4d4455e76bf403466cf1354a1eab1875c8de/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b2c153e63204237c1f10bca1d2a27423e146b75f265c2f1921cec05a28110dde/contract';
import endContract from '../../snapshots/b2c153e63204237c1f10bca1d2a27423e146b75f265c2f1921cec05a28110dde/contract.json' with { type: 'json' };
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
        table: 'crawlerBatch',
        columns: [
          col('acknowledgment', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('batchId', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('payloadHash', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('runId', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'crawlerRun',
        columns: [
          col('configuration', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('counts', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('deadlineAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('failures', 'text', {
            notNull: true,
            default: lit('[]'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('finishedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('leaseExpiresAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('leaseHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('queuedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('sourceId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('startedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('status', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('trigger', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('workerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'crawler_run_status_901551c0',
            "status IN ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED','ABANDONED')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'crawlerSource',
        columns: [
          col('enabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('nextDueAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('pageLimit', 'int4', {
            notNull: true,
            default: lit(2),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('schedule', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('sourceId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('timezone', 'text', {
            notNull: true,
            default: lit('Asia/Yangon'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('version', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['sourceId']),
          checkExpression(
            'crawler_source_bounds_fe6dc966',
            'version >= 0 AND "pageLimit" BETWEEN 1 AND 100',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'crawlerWorker',
        columns: [
          col('lastSeenAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('sourceIds', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('workerId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['workerId'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'crawlerBatch',
        constraint: 'crawlerBatch_runId_batchId_key',
        columns: ['runId', 'batchId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'crawlerBatch',
        index: 'crawlerBatch_runId_idx_a6016437',
        columns: ['runId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'crawlerRun',
        index: 'crawlerRun_sourceId_idx_d92a2571',
        columns: ['sourceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'crawlerRun',
        index: 'crawlerRun_sourceId_status_idx_271a9fd6',
        columns: ['sourceId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'crawlerRun',
        index: 'crawlerRun_status_queuedAt_idx_10265669',
        columns: ['status', 'queuedAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'crawlerBatch',
        foreignKey: {
          name: 'crawlerBatch_runId_fkey',
          columns: ['runId'],
          references: {
            schema: 'public',
            table: 'crawlerRun',
            columns: ['id'],
          },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'crawlerRun',
        foreignKey: {
          name: 'crawlerRun_sourceId_fkey',
          columns: ['sourceId'],
          references: {
            schema: 'public',
            table: 'crawlerSource',
            columns: ['sourceId'],
          },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
