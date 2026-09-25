import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import type { RequestWithContext } from './request-context.middleware';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();
    const details = {
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl,
    };

    return next.handle().pipe(
      tap(() => {
        this.logger.log('HTTP request completed', {
          ...details,
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        });
      }),
      catchError((error: unknown) => {
        this.logger.warn('HTTP request failed', {
          ...details,
          statusCode: error instanceof HttpException ? error.getStatus() : 500,
          durationMs: Math.round(performance.now() - startedAt),
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
        return throwError(() => error);
      }),
    );
  }
}
