import { api } from './client';
import type { Role } from '@/auth/roles';

export interface UserItem {
  user_id: number;
  username: string;
  display_name: string;
  email: string | null;
  status: 'active' | 'inactive';
  roles: Role[];
  must_change_pwd: boolean;
  failed_count: number;
  is_locked: boolean;
  lock_remaining_seconds: number;
  last_login_at: string | null;
  created_at: string | null;
  created_by: number | null;
  updated_at: string | null;
}

export interface RoleMatrixItem {
  role_code: Role;
  role_name: string;
  description: string | null;
  permissions: string[];
  accessible_pages: string[];
}

export interface CreateUserPayload {
  username: string;
  display_name: string;
  email?: string | null;
  password: string;
  roles: Role[];
  must_change_pwd: boolean;
}

export interface UpdateUserPayload {
  display_name: string;
  email?: string | null;
  status: 'active' | 'inactive';
  roles: Role[];
  must_change_pwd: boolean;
}

export interface ResetPasswordPayload {
  new_password: string;
  must_change_pwd: boolean;
}

export const usersApi = {
  list: () => api.get<UserItem[]>('/users'),

  getRolesMatrix: () => api.get<RoleMatrixItem[]>('/users/roles/matrix'),

  create: (data: CreateUserPayload) => api.post<UserItem>('/users', data),

  update: (userId: number, data: UpdateUserPayload) =>
    api.put<UserItem>(`/users/${userId}`, data),

  resetPassword: (userId: number, data: ResetPasswordPayload) =>
    api.post<void>(`/users/${userId}/reset-password`, data),

  unlock: (userId: number) =>
    api.post<void>(`/users/${userId}/unlock`, {}),

  delete: (userId: number) =>
    api.delete<void>(`/users/${userId}`),
};
