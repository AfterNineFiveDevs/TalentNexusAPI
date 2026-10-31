import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
@Injectable()
export class AdminCookieService {
  readonly name: string;
  private readonly options: CookieOptions;
  constructor(config: ConfigService) {
    this.name = config.getOrThrow<string>('ADMIN_REFRESH_COOKIE_NAME');
    this.options = {
      httpOnly: true,
      secure: ['staging', 'production'].includes(
        config.getOrThrow('ENVIRONMENT'),
      ),
      sameSite: 'lax',
      path: '/api/v1/admin/auth',
    };
  }
  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[this.name];
    return typeof value === 'string' ? value : undefined;
  }
  write(response: Response, token: string, expiresAt: string) {
    response.cookie(this.name, token, {
      ...this.options,
      expires: new Date(expiresAt),
    });
  }
  clear(response: Response) {
    response.clearCookie(this.name, this.options);
  }
}
