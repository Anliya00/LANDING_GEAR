import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Plane } from 'lucide-react';
import { NAV } from './nav';
import { AircraftMark } from './AircraftMark1';
import { useSession } from '@/auth/guards';

export function Sidebar({
  collapsed, onToggle,
}: { collapsed: boolean; onToggle: () => void }) {
  const { can } = useSession();

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
        {NAV.filter((item) => !item.permission || can(item.permission)).map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `nav-item${isActive ? ' is-active' : ''}`}
          >
            <item.icon size={22} strokeWidth={1.9} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
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