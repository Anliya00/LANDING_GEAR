export type Role = 'engineer' | 'operator' | 'viewer' | 'admin';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  engineer: 'Engineer',
  operator: 'Import operator',
  viewer: 'Viewer',
};

/** Role precedence for display when an account holds more than one. */
const PRECEDENCE: Role[] = ['admin', 'engineer', 'operator', 'viewer'];

export function primaryRole(roles: Role[]): Role | null {
  return PRECEDENCE.find((r) => roles.includes(r)) ?? null;
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

export function hasAnyRole(roles: Role[], allowed: Role[]): boolean {
  return roles.some((r) => allowed.includes(r));
}
