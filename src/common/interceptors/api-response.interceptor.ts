import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { isApiSuccessEnvelope, success } from '../http/api-response.factory';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          isApiSuccessEnvelope(data) ? data : success(data ?? null),
        ),
      );
  }
}
