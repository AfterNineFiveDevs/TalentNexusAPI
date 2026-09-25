import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { API_ERROR_MESSAGES } from '@talent-nexus/contracts';
import { IS_PUBLIC_KEY } from 'src/@decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(
    error: unknown,
    user: TUser | false | null,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (error || !user) {
      throw new UnauthorizedException(getAuthenticationErrorMessage(info));
    }

    return super.handleRequest(error, user, info, context);
  }
}

function getAuthenticationErrorMessage(info: unknown): string {
  if (hasErrorName(info, 'TokenExpiredError')) {
    return API_ERROR_MESSAGES.JWT_EXPIRED;
  }

  if (hasErrorName(info, 'JsonWebTokenError')) {
    return API_ERROR_MESSAGES.JWT_INVALID;
  }

  return API_ERROR_MESSAGES.UNAUTHORIZED;
}

function hasErrorName(value: unknown, name: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    value.name === name
  );
}
