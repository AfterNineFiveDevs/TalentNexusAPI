#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/9f6790b17aceb7d8f0cbc7f188ff4d4455e76bf403466cf1354a1eab1875c8de/contract';
import endContract from '../../snapshots/9f6790b17aceb7d8f0cbc7f188ff4d4455e76bf403466cf1354a1eab1875c8de/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cc4e51f6795be8105e9f5a44f799d8de36cbf50a61c52e637550d5fbf107b435/contract';
import startContract from '../../snapshots/cc4e51f6795be8105e9f5a44f799d8de36cbf50a61c52e637550d5fbf107b435/contract.json' with { type: 'json' };
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
        table: 'category',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('description', 'text', {
            notNull: true,
            default: lit(''),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('name', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('normalizedName', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('version', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'category_status_check_36b268bc',
            "\"status\" IN ('ACTIVE', 'HIDDEN', 'ARCHIVED')",
          ),
          checkExpression(
            'category_version_nonnegative_ec05e13a',
            'version >= 0',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'categorySubscription',
        columns: [
          col('categoryId', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('id', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
          col('userId', 'uuid', {
            notNull: true,
            codecRef: { codecId: 'pg/uuid@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'job',
        column: col('categoryId', 'uuid', {
          codecRef: { codecId: 'pg/uuid@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'category',
        constraint: 'category_normalizedName_key',
        columns: ['normalizedName'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'categorySubscription',
        constraint: 'categorySubscription_userId_categoryId_key',
        columns: ['userId', 'categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'category',
        index: 'category_status_name_idx_c8d75216',
        columns: ['status', 'name'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'categorySubscription',
        index: 'categorySubscription_categoryId_createdAt_idx_959807f1',
        columns: ['categoryId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'categorySubscription',
        index: 'categorySubscription_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'categorySubscription',
        index: 'categorySubscription_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'job',
        index: 'job_categoryId_idx_15c304f2',
        columns: ['categoryId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'categorySubscription',
        foreignKey: {
          name: 'categorySubscription_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'categorySubscription',
        foreignKey: {
          name: 'categorySubscription_categoryId_fkey',
          columns: ['categoryId'],
          references: { schema: 'public', table: 'category', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'job',
        foreignKey: {
          name: 'job_categoryId_fkey',
          columns: ['categoryId'],
          references: { schema: 'public', table: 'category', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
