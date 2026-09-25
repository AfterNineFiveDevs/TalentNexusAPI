import {
  ArgumentsHost,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { vi } from 'vitest';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const createHost = () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    return { host, status, json };
  };

  it('preserves known HTTP exception statuses and messages', () => {
    const { host, status, json } = createHost();

    new ApiExceptionFilter().catch(new UnauthorizedException(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Unauthorized',
    });
  });

  it('returns a safe response for unexpected exceptions', () => {
    const { host, status, json } = createHost();
    const filter = new ApiExceptionFilter();
    const logError = vi
      .spyOn((filter as any).logger, 'error')
      .mockImplementation(() => undefined);

    filter.catch(new Error('database connection failed'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
    });
    expect(logError).toHaveBeenCalled();
  });
});
