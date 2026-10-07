import { api } from './client';
import type { Role } from '@/auth/roles';

export interface CurrentUser {
  user_id: number;
  username: string;
  display_name: string;
  email: string | null;
  roles: Role[];
  must_change_password: boolean;
  last_login_at: string | null;
}

export const authApi = {
  login: (username: string, password: string, remember: boolean) =>
    api.post<CurrentUser>('/auth/login', { username, password, remember }),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<CurrentUser>('/auth/me'),

  changePassword: (current_password: string, new_password: string) =>
    api.post<void>('/auth/password', { current_password, new_password }),
};
