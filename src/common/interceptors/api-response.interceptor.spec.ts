import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { paginated } from '../http/api-response.factory';
import { ApiResponseInterceptor } from './api-response.interceptor';

describe('ApiResponseInterceptor', () => {
  const context = {} as ExecutionContext;
  const interceptor = new ApiResponseInterceptor();

  it('wraps ordinary values and converts undefined to null', async () => {
    const value = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of(undefined),
      } as CallHandler),
    );

    expect(value).toEqual({ success: true, data: null });
  });

  it('passes paginated responses through unchanged', async () => {
    const response = paginated(['user'], {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    const value = await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of(response),
      } as CallHandler),
    );

    expect(value).toBe(response);
  });
});
