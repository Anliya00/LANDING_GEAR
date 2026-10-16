import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
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

  if (status === 'loading') return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !hasAnyRole(user.roles, roles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
