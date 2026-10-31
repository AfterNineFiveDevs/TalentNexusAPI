import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  API_ERROR_MESSAGES,
  authenticatedUserSchema,
  type AuthenticatedUser,
} from '@talent-nexus/contracts';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
    });
  }

  validate(payload: unknown): AuthenticatedUser {
    const claims = payload as Record<string, unknown>;
    const result = authenticatedUserSchema.safeParse({
      id: claims.sub,
      email: claims.email,
      role: claims.role,
    });

    if (!result.success) {
      throw new UnauthorizedException(API_ERROR_MESSAGES.JWT_INVALID);
    }

    const adminSessionId =
      claims.aud === 'talentnexus-admin' &&
      Array.isArray(claims.amr) &&
      claims.amr.includes('pwd') &&
      claims.amr.includes('mfa') &&
      typeof claims.sid === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        claims.sid,
      )
        ? claims.sid
        : undefined;
    return { ...result.data, ...(adminSessionId ? { adminSessionId } : {}) };
  }
}
