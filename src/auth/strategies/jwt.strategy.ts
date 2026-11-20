import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  API_ERROR_MESSAGES,
  authenticatedUserSchema,
} from '@talent-nexus/contracts';
import {
  ADMIN_AUDIENCE,
  PRODUCT_AUDIENCE,
  type AccessPrincipal,
} from '../access-token';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
    });
  }

  validate(payload: unknown): AccessPrincipal {
    const invalid = () =>
      new UnauthorizedException(API_ERROR_MESSAGES.JWT_INVALID);
    if (!payload || typeof payload !== 'object') throw invalid();
    const claims = payload as Record<string, unknown>;
    const result = authenticatedUserSchema.safeParse({
      id: claims.sub,
      email: claims.email,
      role: claims.role,
    });

    if (!result.success) throw invalid();

    if (claims.aud === ADMIN_AUDIENCE) {
      if (
        !Array.isArray(claims.amr) ||
        !claims.amr.includes('pwd') ||
        !claims.amr.includes('mfa') ||
        typeof claims.sid !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          claims.sid,
        )
      ) {
        throw invalid();
      }
      return {
        ...result.data,
        tokenAudience: ADMIN_AUDIENCE,
        adminSessionId: claims.sid,
      };
    }

    // Existing product JWTs were issued without an audience or session claims.
    if (
      (claims.aud !== undefined && claims.aud !== PRODUCT_AUDIENCE) ||
      claims.sid !== undefined ||
      claims.amr !== undefined
    ) {
      throw invalid();
    }
    return { ...result.data, tokenAudience: PRODUCT_AUDIENCE };
  }
}
