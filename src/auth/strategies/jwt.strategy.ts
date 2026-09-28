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

    return result.data;
  }
}
