import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { FlightProvider } from '@/flight/FlightProvider';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

const RAIL = 'sftad.rail.collapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(RAIL) === '1',
  );

  useEffect(() => {
    localStorage.setItem(RAIL, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <FlightProvider>
      <div className={`shell${collapsed ? ' rail-collapsed' : ''}`}>
        <Sidebar collapsed={collapsed}
                 onToggle={() => setCollapsed((v) => !v)} />
        <TopBar />
        <main className="shell-main">
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </main>
      </div>
    </FlightProvider>
  );
}