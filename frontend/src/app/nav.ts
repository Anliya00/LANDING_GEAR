import {
  Home, Plane, Upload, ListChecks, LineChart, Activity,
  BarChart3, Settings, Users,
} from 'lucide-react';
import type { Permission } from '@/auth/guards';

export interface NavItem {
  label: string;
  to: string;
  icon: typeof Home;
  flightScoped?: boolean;
  permission?: Permission;
}

export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: 'Overview', items: [
    { label: 'Home', to: '/', icon: Home },
  ]},
  { label: 'Data', items: [
    { label: 'Flights',   to: '/flights',   icon: Plane },
    { label: 'Ingestion', to: '/ingestion', icon: Upload },
    { label: 'Queue',     to: '/queue',     icon: ListChecks },
  ]},
  { label: 'Flight', items: [
    { label: 'Analysis', to: '/plots/retraction', icon: LineChart, flightScoped: true },
    { label: 'Events',   to: '/events',           icon: Activity,  flightScoped: true },
  ]},
  { label: 'Fleet', items: [
    { label: 'Fleet Statistics', to: '/statistics', icon: BarChart3 },
  ]},
  { label: 'Admin', items: [
    { label: 'Configuration',   to: '/configuration', icon: Settings },
    { label: 'User Management', to: '/users', icon: Users, permission: 'manage_users' },
  ]},
];