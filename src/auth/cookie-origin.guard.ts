import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_MESSAGES } from '@talent-nexus/contracts';
import type { Request } from 'express';
import type { Environment, EnvironmentVariables } from 'src/config/environment';

@Injectable()
export class CookieOriginGuard implements CanActivate {
  private readonly enforceOrigin: boolean;
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const environment = config.getOrThrow<Environment>('ENVIRONMENT', {
      infer: true,
    });
    this.enforceOrigin =
      environment === 'staging' || environment === 'production';
    this.allowedOrigins = new Set(
      (config.get('CORS_ORIGIN', { infer: true }) ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enforceOrigin) {
      return true;
    }
    const origin = context.switchToHttp().getRequest<Request>().get('origin');
    if (!origin || this.allowedOrigins.has(origin)) {
      return true;
    }
    throw new ForbiddenException(API_ERROR_MESSAGES.FORBIDDEN);
  }
}
