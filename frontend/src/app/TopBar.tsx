import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Sun, Moon, Search, Bell } from 'lucide-react';
import { useSession, roleLabel } from '@/auth/guards';
import { useFlight } from '@/flight/FlightProvider';
import { useTheme } from '@/theme/ThemeProvider';

export function TopBar() {
  const { user, signOut } = useSession();
  const { flight } = useFlight();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const nav = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      nav(`/flights?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        {flight ? (
          <button type="button" className="flight-chip"
                  onClick={() => nav(`/flights/${flight.tail}`)}>
            <strong>{flight.tail}</strong>
            <span className="sep">/</span>
            <span>{flight.flightNo}</span>
            <span className="declared" title="Date as declared in the folder name">
              {flight.declaredDate} (declared)
            </span>
          </button>
        ) : (
          <form onSubmit={handleSearchSubmit} className="topbar-search">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search flights (e.g. AFR256, A320, 2026-10-03)..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        )}
      </div>

      <div className="topbar-right">
        <button type="button" className="icon-btn" title="Notifications" aria-label="Notifications">
          <Bell size={19} />
        </button>

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