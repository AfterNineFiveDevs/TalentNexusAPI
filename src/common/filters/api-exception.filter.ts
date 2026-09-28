import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  API_ERROR_MESSAGES,
  type ApiFieldErrors,
} from '@talent-nexus/contracts';
import { failure } from '../http/api-response.factory';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const { message, errors } = this.getHttpExceptionResponse(exception);
      response.status(exception.getStatus()).json(failure(message, errors));
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(failure(API_ERROR_MESSAGES.INTERNAL_SERVER_ERROR));
  }

  private getHttpExceptionResponse(exception: HttpException): {
    message: string;
    errors?: ApiFieldErrors;
  } {
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return { message: exceptionResponse };
    }

    const responseBody = exceptionResponse as Record<string, unknown>;
    return {
      message:
        typeof responseBody.message === 'string'
          ? responseBody.message
          : exception.message,
      errors: this.getFieldErrors(responseBody.errors),
    };
  }

  private getFieldErrors(value: unknown): ApiFieldErrors | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return undefined;
    }

    const errors = Object.entries(value);
    return errors.every(([, message]) => typeof message === 'string')
      ? Object.fromEntries(errors)
      : undefined;
  }
}
