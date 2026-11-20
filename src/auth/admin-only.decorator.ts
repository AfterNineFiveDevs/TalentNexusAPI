import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ADMIN_ROUTE_KEY } from './access-token';
import { AdminGuard } from './admin.guard';

export const AdminOnly = () =>
  applyDecorators(SetMetadata(ADMIN_ROUTE_KEY, true), UseGuards(AdminGuard));
