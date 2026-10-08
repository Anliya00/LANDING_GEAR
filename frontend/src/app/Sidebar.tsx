import { NavLink, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Plane } from 'lucide-react';
import { NAV } from './nav';
import { AircraftMark } from './AircraftMark';
import { useSession } from '@/auth/guards';
import { lastFlightPath } from '@/flight/FlightProvider';

export function Sidebar({
  collapsed, onToggle,
}: { collapsed: boolean; onToggle: () => void }) {
  const { can } = useSession();
  const loc = useLocation();

  const m = loc.pathname.match(/^\/flights\/([^/]+)\/([^/]+)/);
  const flightPath = m ? `${m[1]}/${m[2]}` : lastFlightPath();

  const resolve = (to: string, scoped?: boolean) =>
    scoped ? (flightPath ? `/flights/${flightPath}${to}` : '/flights') : to;

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
            <div className="sidebar-mark">
        <Plane className="sidebar-mark-icon" size={34} strokeWidth={2} />
        {!collapsed && (
          <span className="sidebar-mark-text">
            <span className="sidebar-mark-name">SFTAD</span>
            <span className="sidebar-mark-sub">
              Flight Data Analysis &amp; Diagnostics
            </span>
          </span>
        )}
      </div>

      <nav className="sidebar-nav">
        {NAV.map((group) => {
          const items = group.items.filter(
            (i) => !i.permission || can(i.permission),
          );
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group.label}>
              {!collapsed && <p className="nav-label">{group.label}</p>}
              {items.map((item) => (
                <NavLink
                  key={item.label}
                  to={resolve(item.to, item.flightScoped)}
                  end={item.to === '/'}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `nav-item${isActive ? ' is-active' : ''}`}
                >
                <item.icon size={22} strokeWidth={1.9} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-art" aria-hidden="true">
        <AircraftMark className="sidebar-art-svg" />
      </div>

      <div className="sidebar-foot">
        <button type="button" className="rail-toggle" onClick={onToggle}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          {!collapsed && <span>Collapse</span>}
        </button>

        <div className="sidebar-orgs">
          <img className="logo-cdac" src="/logos/cdac.png" alt="C-DAC" />
          <span className="org-rule" />
          <img className="logo-hal" src="/logos/hal.png" alt="HAL" />
        </div>
        <p className="sidebar-version">SFTAD v0.1</p>
      </div>
    </aside>
  );
}