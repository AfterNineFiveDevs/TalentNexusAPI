import {
  failure,
  isApiSuccessEnvelope,
  paginated,
  success,
} from './api-response.factory';

describe('API response factory', () => {
  it('creates successful and paginated envelopes', () => {
    const standardResponse = success({ id: 1 });
    const paginatedResponse = paginated([{ id: 1 }], {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    expect(standardResponse).toEqual({ success: true, data: { id: 1 } });
    expect(paginatedResponse.meta.total).toBe(1);
    expect(isApiSuccessEnvelope(paginatedResponse)).toBe(true);
  });

  it('creates failed envelopes without details by default', () => {
    expect(failure('Unauthorized')).toEqual({
      success: false,
      message: 'Unauthorized',
    });
  });
});
