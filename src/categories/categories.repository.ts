import { Injectable } from '@nestjs/common';
import type {
  AdminCategoriesQuery,
  CategoryPagination,
  CreateCategoryRequest,
} from '@talent-nexus/contracts';
import type { Scalars } from '@prisma/orm-postgres/family-contract/types';
import type { Models } from '../prisma/contract';
import { db } from '../prisma/db';

export type CategoryRow = Scalars<Models.public_Category>;
const iso = (value: string) => new Date(value).toISOString();
const contains = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

export class CategoriesStore {
  constructor(private readonly orm: typeof db.orm.public) {}
  find(id: string) {
    return this.orm.Category.where({ id }).first();
  }
  byName(normalizedName: string) {
    return this.orm.Category.where({ normalizedName }).first();
  }
  create(input: CreateCategoryRequest, normalizedName: string) {
    return this.orm.Category.create({ ...input, normalizedName });
  }
  update(
    current: CategoryRow,
    changes: Partial<
      Pick<CategoryRow, 'name' | 'normalizedName' | 'description' | 'status'>
    >,
  ) {
    return this.orm.Category.where({
      id: current.id,
      version: current.version,
      status: current.status,
    }).update({ ...changes, version: current.version + 1 });
  }
  private summaries() {
    return this.orm.Category.select(
      'id',
      'name',
      'description',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    )
      .include('subscriptions', (s) => s.count())
      .include('jobs', (j) => j.count());
  }
  private present(
    row: Awaited<ReturnType<ReturnType<CategoriesStore['summaries']>['first']>>,
  ) {
    if (!row) return null;
    const { jobs, subscriptions, ...category } = row;
    return {
      ...category,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      assignedJobCount: jobs,
      subscriberCount: subscriptions,
    };
  }
  async detail(id: string) {
    return this.present(await this.summaries().where({ id }).first());
  }
  async list(query: AdminCategoriesQuery) {
    let categories = this.summaries();
    if (query.status === undefined)
      categories = categories.where((c) => c.status.neq('ARCHIVED'));
    else if (query.status !== 'all')
      categories = categories.where({ status: query.status });
    if (query.search)
      categories = categories.where((c) =>
        c.name.ilike(contains(query.search!)),
      );
    const { total } = await categories.aggregate((a) => ({ total: a.count() }));
    const rows = await categories
      .orderBy([(c) => c.name.asc(), (c) => c.id.asc()])
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .all();
    return { items: rows.map((row) => this.present(row)!), total };
  }
  async catalog(query: CategoryPagination) {
    const categories = this.orm.Category.where({ status: 'ACTIVE' }).select(
      'id',
      'name',
      'description',
    );
    const { total } = await categories.aggregate((a) => ({ total: a.count() }));
    return {
      items: await categories
        .orderBy([(c) => c.name.asc(), (c) => c.id.asc()])
        .offset((query.page - 1) * query.limit)
        .limit(query.limit)
        .all(),
      total,
    };
  }
  async subscribers(categoryId: string, query: CategoryPagination) {
    const subscriptions = this.orm.CategorySubscription.where({ categoryId });
    const { total } = await subscriptions.aggregate((a) => ({
      total: a.count(),
    }));
    const rows = await subscriptions
      .select('userId', 'createdAt')
      .include('user', (u) => u.select('email', 'name'))
      .orderBy([(s) => s.createdAt.desc(), (s) => s.id.asc()])
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .all();
    return {
      items: rows.map((s) => ({
        userId: s.userId,
        email: s.user!.email,
        name: s.user!.name,
        subscribedAt: iso(s.createdAt),
      })),
      total,
    };
  }
  userRole(id: string) {
    return this.orm.User.where({ id }).select('role').first();
  }
  async subscriptions(userId: string, query: CategoryPagination) {
    const subscriptions = this.orm.CategorySubscription.where({ userId });
    const { total } = await subscriptions.aggregate((a) => ({
      total: a.count(),
    }));
    const rows = await subscriptions
      .select('createdAt')
      .include('category', (c) =>
        c.select('id', 'name', 'description', 'status'),
      )
      .orderBy([(s) => s.createdAt.desc(), (s) => s.id.asc()])
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .all();
    return {
      items: rows.map((s) => ({
        category: s.category!,
        subscribedAt: iso(s.createdAt),
      })),
      total,
    };
  }
  subscription(userId: string, categoryId: string) {
    return this.orm.CategorySubscription.where({ userId, categoryId }).first();
  }
  subscribe(userId: string, categoryId: string) {
    return this.orm.CategorySubscription.create({ userId, categoryId });
  }
  unsubscribe(userId: string, categoryId: string) {
    return this.orm.CategorySubscription.where({
      userId,
      categoryId,
    }).deleteAndCount();
  }
}

@Injectable()
export class CategoriesRepository extends CategoriesStore {
  constructor() {
    super(db.orm.public);
  }
  transaction<T>(operation: (store: CategoriesStore) => Promise<T>) {
    return db.transaction(async (tx) => {
      // Shared with admin role changes and category-aware job writes.
      await tx.query(
        db.raw.sql`SELECT pg_advisory_xact_lock(1846532101)::text AS locked`
          .returnsRow({ locked: 'pg/text@1' })
          .build(),
      );
      return operation(new CategoriesStore(tx.orm.public));
    });
  }
}
