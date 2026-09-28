import type { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from '../filters/api-exception.filter';
import { ApiResponseInterceptor } from '../interceptors/api-response.interceptor';
import { HttpLoggingInterceptor } from '../observability/http-logging.interceptor';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

export function configureApiResponseHandling(app: INestApplication): void {
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(),
    new ApiResponseInterceptor(),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
