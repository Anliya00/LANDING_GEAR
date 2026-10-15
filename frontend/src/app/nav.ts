import {
  Home, Plane, Upload, BarChart3, Settings, Users,
} from 'lucide-react';
import type { Permission } from '@/auth/guards';

export interface NavItem {
  label: string;
  to: string;
  icon: typeof Home;
  flightScoped?: boolean;
  permission?: Permission;
}

export const NAV: NavItem[] = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Flights', to: '/flights', icon: Plane },
  { label: 'Ingestion', to: '/ingestion', icon: Upload },
  { label: 'Analysis Dashboard', to: '/dashboard', icon: BarChart3 },
  { label: 'Configuration', to: '/configuration', icon: Settings },
  { label: 'User Management', to: '/users', icon: Users, permission: 'manage_users' },
];