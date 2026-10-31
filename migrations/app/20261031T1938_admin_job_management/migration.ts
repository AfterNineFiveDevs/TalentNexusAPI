#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/400e034cd7414bffdc1c1d13f47f2158e20c239ac3942839b51b6c7c011e8f1c/contract';
import startContract from '../../snapshots/400e034cd7414bffdc1c1d13f47f2158e20c239ac3942839b51b6c7c011e8f1c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/bae8dddd7198ed6cad3ede8060b268be4b802ee7ceaa2347145ffe6960391dd3/contract';
import endContract from '../../snapshots/bae8dddd7198ed6cad3ede8060b268be4b802ee7ceaa2347145ffe6960391dd3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('adminEditedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('deletedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('lastAdminAction', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('lastAdminActionAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('lastAdminActionById', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('lastAdminActionNote', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('version', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'job',
        constraint: 'job_lastAdminAction_check_adadbbbb',
        expression:
          "\"lastAdminAction\" IN ('CREATE', 'EDIT', 'PUBLISH', 'REJECT', 'CLOSE', 'REOPEN', 'DELETE', 'RESTORE')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'job',
        constraint: 'job_version_nonnegative_ec05e13a',
        expression: 'version >= 0',
      }),
      this.createIndex({
        schema: 'public',
        table: 'job',
        index: 'job_deletedAt_status_createdAt_idx_87357d33',
        columns: ['deletedAt', 'status', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'job',
        index: 'job_lastAdminActionById_idx_b9d717c8',
        columns: ['lastAdminActionById'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'job',
        foreignKey: {
          name: 'job_last_admin_action_by_fkey',
          columns: ['lastAdminActionById'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
