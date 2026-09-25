import type {
  ApiErrorResponse,
  ApiFieldErrors,
  ApiPaginatedResponse,
  ApiSuccessResponse,
  PaginationMeta,
} from '@talent-nexus/contracts';

export type ApiSuccessEnvelope<TData> =
  ApiSuccessResponse<TData> | ApiPaginatedResponse<TData>;

export function success<TData>(
  data: TData,
  message?: string,
): ApiSuccessResponse<TData> {
  return message === undefined
    ? { success: true, data }
    : { success: true, data, message };
}

export function paginated<TData>(
  data: TData[],
  meta: PaginationMeta,
  message?: string,
): ApiPaginatedResponse<TData> {
  return message === undefined
    ? { success: true, data, meta }
    : { success: true, data, meta, message };
}

export function failure(
  message: string,
  errors?: ApiFieldErrors,
): ApiErrorResponse {
  return errors === undefined
    ? { success: false, message }
    : { success: false, message, errors };
}

export function isApiSuccessEnvelope(
  value: unknown,
): value is ApiSuccessEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    value.success === true &&
    'data' in value
  );
}
