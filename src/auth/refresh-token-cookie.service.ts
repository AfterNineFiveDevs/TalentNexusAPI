import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Environment, EnvironmentVariables } from 'src/config/environment';

@Injectable()
export class RefreshTokenCookieService {
  readonly name: string;
  private readonly options: CookieOptions;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const environment = config.getOrThrow<Environment>('ENVIRONMENT', {
      infer: true,
    });
    const ttlSeconds = config.getOrThrow('REFRESH_TOKEN_TTL_SECONDS', {
      infer: true,
    });
    this.name = config.getOrThrow('REFRESH_TOKEN_COOKIE_NAME', { infer: true });
    this.options = {
      httpOnly: true,
      secure: environment === 'staging' || environment === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: ttlSeconds * 1000,
    };
  }

  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[this.name];
    return typeof value === 'string' ? value : undefined;
  }

  write(response: Response, refreshToken: string): void {
    response.cookie(this.name, refreshToken, this.options);
  }

  clear(response: Response): void {
    const clearOptions = { ...this.options };
    delete clearOptions.maxAge;
    response.clearCookie(this.name, clearOptions);
  }
}
