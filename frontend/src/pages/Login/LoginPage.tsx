import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { GearSchematic } from './GearSchematic';
import './login.css';

const CDAC_LOGO = '/logos/cdac.png';
const HAL_LOGO = '/logos/hal.png';

interface LocationState {
  from?: string;
}

export default function LoginPage() {
  const { signIn, user, status } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = (location.state as LocationState | null)?.from ?? '/flights';

  // Already signed in — a stale /login tab should not sit there asking again.
  useEffect(() => {
    if (status === 'ready' && user) {
      navigate(destination, { replace: true });
    }
  }, [status, user, destination, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signIn(username.trim(), password, remember);
      navigate(destination, { replace: true });
    } catch (err) {
      setPassword('');
      setError(
        err instanceof ApiError
          ? err.message
          : 'Sign-in failed. Try again, or contact your administrator.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login-plate">
        <div className="login-orgs">
          <img src={CDAC_LOGO} alt="C-DAC" />
          <div className="org-rule" />
          <img src={HAL_LOGO} alt="HAL" />
        </div>

        <div className="login-plate-drawing">
          <GearSchematic />
        </div>

        <div>
          <div className="login-plate-caption">
            <h2>Landing gear flight test data, measured rather than assumed</h2>
            <p>
              SFTAD reads recorded flight test files, detects the switch
              transitions that bound each gear cycle, and computes the landing
              gear parameters from them — with every value traceable to the
              events that produced it.
            </p>
          </div>

          <div className="login-plate-legend">
            <span>
              <b>6</b> files per flight
            </span>
            <span>
              <b>8</b> computed parameters
            </span>
            <span>
              <b>72</b> minutes recorded
            </span>
            <span>
              <b>µs</b> timestamp resolution
            </span>
          </div>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-form-wrap">
          <div className="login-orgs-compact">
            <img src={CDAC_LOGO} alt="C-DAC" />
            <img src={HAL_LOGO} alt="HAL" />
          </div>

          <p className="login-brand">SFTAD</p>
          <h1>Sign in</h1>
          <p className="login-sub">
            Smart Flight Test Analytics Dashboard — landing gear group.
          </p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="login-row">
              <label className="check" htmlFor="remember">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Keep me signed in
              </label>
              <span className="login-note">
                Your role is set by your administrator
              </span>
            </div>

            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="login-foot">
            <span>SFTAD v0.1 · Proof of concept</span>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
