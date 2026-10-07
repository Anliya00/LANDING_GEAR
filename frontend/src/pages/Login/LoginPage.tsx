import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import './login.css';

const CDAC_LOGO = '/logos/cdac.png';
const HAL_LOGO = '/logos/hal.png';

interface LocationState {
  from?: string;
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
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
      <div className="login-bg" />

      <header className="login-header">
        <div className="login-orgs">
          <img src={CDAC_LOGO} alt="C-DAC" />
          <div className="org-rule" />
          <img src={HAL_LOGO} alt="HAL" />
        </div>
        <p className="login-tagline">Flight Data Analysis &amp; Diagnostics</p>
      </header>

      <main className="login-body">
        <div className="login-card">
          <h1>
            Welcome to
            <span className="product">SFTAD</span>
          </h1>
          <p className="login-sub">Smart Flight Test Analytics Dashboard</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <div className="field-icon">
              <UserIcon />
              <input
                id="username"
                name="username"
                aria-label="Username"
                placeholder="Username"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="field-icon">
              <LockIcon />
              <input
                id="password"
                name="password"
                type="password"
                aria-label="Password"
                placeholder="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="login-row">
              <label className="check" htmlFor="remember">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <span className="login-note">Role is set by your administrator</span>
            </div>
          </form>
        </div>
      </main>

      <footer className="login-footer">
        <span>SFTAD v0.1 · Proof of concept</span>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggle}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </footer>
    </div>
  );
}