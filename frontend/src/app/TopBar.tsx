import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Sun, Moon } from 'lucide-react';
import { useSession, roleLabel } from '@/auth/guards';
import { useFlight } from '@/flight/FlightProvider';
import { useTheme } from '@/theme/ThemeProvider';


export function TopBar() {
  const { user, signOut } = useSession();
  const { flight } = useFlight();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  return (
    <header className="topbar">
      <div className="topbar-left">
        {flight && (
          <button type="button" className="flight-chip"
                  onClick={() => nav(`/flights/${flight.tail}`)}>
            <strong>{flight.tail}</strong>
            <span className="sep">/</span>
            <span>{flight.flightNo}</span>
            <span className="declared" title="Date as declared in the folder name">
              {flight.declaredDate} (declared)
            </span>
          </button>
        )}
      </div>

      <div className="topbar-right">
        {/* Queue activity slot — rendered when /queue lands. Deliberately
            empty rather than a bell with nothing behind it. */}
        <span className="activity-slot" />

        <button type="button" className="icon-btn" onClick={toggle}
                aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="user-menu">
                    <button type="button" className="user-btn"
                  onClick={() => setOpen((v) => !v)}>
            <span className="avatar">
              {(user?.display_name ?? user?.username ?? '?')
                .charAt(0)
                .toUpperCase()}
            </span>
            <span className="user-text">
              <span className="user-name">
                {user?.display_name ?? user?.username}
              </span>
              <span className="user-role">{roleLabel(user?.roles)}</span>
            </span>
            <ChevronDown size={18} />
          </button>
          {open && (
            <div className="user-pop" onMouseLeave={() => setOpen(false)}>
              <p className="user-pop-id">{user?.username}</p>
              <button type="button" onClick={() => { nav('/change-password'); setOpen(false); }}>
                Change password
              </button>
              <button type="button" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}