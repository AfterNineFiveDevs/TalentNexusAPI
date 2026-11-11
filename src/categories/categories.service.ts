import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AdminCategoriesQuery,
  CategoryPagination,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '@talent-nexus/contracts';
import { paginated } from '../common/http/api-response.factory';
import { CategoriesRepository, CategoriesStore } from './categories.repository';

@Injectable()
export class CategoriesService {
  constructor(private readonly repository: CategoriesRepository) {}
  private page<T>(
    result: { items: T[]; total: number },
    query: CategoryPagination,
  ) {
    const totalPages = Math.ceil(result.total / query.limit);
    return paginated(result.items, {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    });
  }
  async list(query: AdminCategoriesQuery) {
    return this.page(await this.repository.list(query), query);
  }
  async catalog(query: CategoryPagination) {
    return this.page(await this.repository.catalog(query), query);
  }
  async detail(id: string) {
    const category = await this.repository.detail(id);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
  create(input: CreateCategoryRequest) {
    return this.repository.transaction(async (store) => {
      const normalizedName = input.name.trim().toLowerCase();
      if (await store.byName(normalizedName))
        throw new ConflictException(
          'Category name already exists, including archived categories',
        );
      const category = await store.create(input, normalizedName);
      return (await store.detail(category.id))!;
    });
  }
  update(id: string, input: UpdateCategoryRequest) {
    return this.mutate(id, input.expectedVersion, 'EDIT', input);
  }
  archive(id: string, version: number) {
    return this.mutate(id, version, 'ARCHIVE');
  }
  restore(id: string, version: number) {
    return this.mutate(id, version, 'RESTORE');
  }
  private mutate(
    id: string,
    version: number,
    action: 'EDIT' | 'ARCHIVE' | 'RESTORE',
    input?: UpdateCategoryRequest,
  ) {
    return this.repository.transaction(async (store) => {
      const category = await store.find(id);
      if (!category) throw new NotFoundException('Category not found');
      if (category.version !== version)
        throw new ConflictException(
          'Category changed; refresh before retrying',
        );
      if ((action === 'RESTORE') !== (category.status === 'ARCHIVED'))
        throw new ConflictException(
          action === 'RESTORE'
            ? 'Category is not archived'
            : 'Restore the archived category before changing it',
        );
      let normalizedName: string | undefined;
      if (input?.name !== undefined) {
        normalizedName = input.name.trim().toLowerCase();
        const duplicate = await store.byName(normalizedName);
        if (duplicate && duplicate.id !== id)
          throw new ConflictException(
            'Category name already exists, including archived categories',
          );
      }
      const changes =
        action === 'ARCHIVE'
          ? { status: 'ARCHIVED' as const }
          : action === 'RESTORE'
            ? { status: 'HIDDEN' as const }
            : {
                ...(input?.name !== undefined
                  ? { name: input.name, normalizedName }
                  : {}),
                ...(input?.description !== undefined
                  ? { description: input.description }
                  : {}),
                ...(input?.status !== undefined
                  ? { status: input.status }
                  : {}),
              };
      if (!(await store.update(category, changes)))
        throw new ConflictException(
          'Category changed; refresh before retrying',
        );
      return (await store.detail(id))!;
    });
  }
  async subscribers(id: string, query: CategoryPagination) {
    await this.detail(id);
    return this.page(await this.repository.subscribers(id, query), query);
  }
  subscriptions(userId: string, query: CategoryPagination) {
    return this.repository.transaction(async (store) => {
      await this.requireCandidate(store, userId);
      return this.page(await store.subscriptions(userId, query), query);
    });
  }
  subscribe(userId: string, categoryId: string) {
    return this.repository.transaction(async (store) => {
      await this.requireCandidate(store, userId);
      const category = await store.find(categoryId);
      if (!category || category.status !== 'ACTIVE')
        throw new NotFoundException('Active category not found');
      const subscription =
        (await store.subscription(userId, categoryId)) ??
        (await store.subscribe(userId, categoryId));
      return {
        category: {
          id: category.id,
          name: category.name,
          description: category.description,
          status: category.status,
        },
        subscribedAt: new Date(subscription.createdAt).toISOString(),
      };
    });
  }
  unsubscribe(userId: string, categoryId: string) {
    return this.repository.transaction(async (store) => {
      await this.requireCandidate(store, userId);
      await store.unsubscribe(userId, categoryId);
    });
  }
  private async requireCandidate(store: CategoriesStore, userId: string) {
    const user = await store.userRole(userId);
    if (!user) throw new UnauthorizedException();
    if (user.role !== 'TALENT')
      throw new ForbiddenException('Candidate account required');
  }
}
