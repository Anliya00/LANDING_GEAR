import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import type { Role } from '@/auth/roles';

export type Permission = 'manage_users' | 'ingest' | 'configure';

/**
 * A user may hold several roles, so permissions are the union of their
 * grants. Keys must match the Role union in @/auth/roles exactly.
 */
const GRANTS: Record<string, Permission[]> = {
  admin: ['manage_users', 'ingest', 'configure'],
  engineer: ['ingest', 'configure'],
  operator: ['ingest'],
  viewer: [],
};

/** Display labels for roles, shown in the top bar. Never a control. */
const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  engineer: 'Engineer',
  operator: 'Import Operator',
  viewer: 'Viewer',
};

export function roleLabel(roles: Role[] | undefined): string {
  if (!roles?.length) return '';
  return roles.map((r) => ROLE_LABEL[r] ?? r).join(', ');
}

/**
 * Shell-facing view of the session. Permissions are a shell concern, not an
 * auth concern — AuthProvider answers "who is signed in", this answers
 * "what may they reach". Keeping them apart means the login flow can change
 * without touching navigation, and vice versa.
 */
export function useSession() {
  const { user, status, signOut } = useAuth();
  const roles = user?.roles ?? [];

  return {
    user,
    roles,
    loading: status === 'loading',
    signOut,
    can: (p: Permission) => roles.some((r) => (GRANTS[r] ?? []).includes(p)),
  };
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const loc = useLocation();

  if (status === 'loading') return <div className="shell-boot" />;
  if (!user) {
    const next = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (user.must_change_password && loc.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}

export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { can } = useSession();
  return can(permission) ? <>{children}</> : <Navigate to="/" replace />;
}