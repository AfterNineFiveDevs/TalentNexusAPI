import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, type AuthenticatedUser } from '@talent-nexus/contracts';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser & { adminSessionId?: string } }>();
    if (!request.user) throw new UnauthorizedException();
    if (request.user.role !== Role.Admin || !request.user.adminSessionId)
      throw new ForbiddenException('MFA-authenticated admin access required');
    request.user = await this.auth.authorize(
      request.user.id,
      request.user.adminSessionId,
    );
    return true;
  }
}
