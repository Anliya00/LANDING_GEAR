import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { hasAnyRole, type Role } from './roles';

/**
 * Route guard. This hides what a role cannot use; it is not the security
 * boundary — the API refuses regardless of what the browser renders.
 */
export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return null;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !hasAnyRole(user.roles, roles)) {
    return <Navigate to="/flights" replace />;
  }

  return <>{children}</>;
}
