import type { AuthenticatedUser } from '@talent-nexus/contracts';

export const PRODUCT_AUDIENCE = 'talentnexus-product';
export const ADMIN_AUDIENCE = 'talentnexus-admin';
export const ADMIN_ROUTE_KEY = 'requiresAdminSession';

export type AccessPrincipal = AuthenticatedUser &
  (
    | { tokenAudience: typeof PRODUCT_AUDIENCE }
    | { tokenAudience: typeof ADMIN_AUDIENCE; adminSessionId: string }
  );
