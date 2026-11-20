import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@talent-nexus/contracts';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { ADMIN_AUDIENCE, type AccessPrincipal } from './access-token';
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AccessPrincipal }>();
    if (!request.user) throw new UnauthorizedException();
    if (
      request.user.role !== Role.Admin ||
      request.user.tokenAudience !== ADMIN_AUDIENCE
    )
      throw new ForbiddenException('MFA-authenticated admin access required');
    const actor = await this.auth.authorize(
      request.user.id,
      request.user.adminSessionId,
    );
    request.user = { ...actor, tokenAudience: ADMIN_AUDIENCE };
    return true;
  }
}
