import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import './login.css';

const CDAC_LOGO = '/logos/cdac.png';
const HAL_LOGO = '/logos/hal.png';

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const { theme, toggle } = useTheme();

  const [current, setCurrent] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    
    if (newPassword !== confirm) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await authApi.changePassword(current, newPassword);
      // Success. Session is revoked on the server.
      // Refreshing will fetch /auth/me, get a 401, and clear the session state.
      // The RequireAuth guard will then automatically redirect to /login.
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to change password. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-bg" />

      <header className="login-header">
        <p className="login-tagline">Flight Data Analysis &amp; Diagnostics</p>
      </header>

      <main className="login-body">
        <div className="login-card">
          <div className="card-orgs">
            <img src={CDAC_LOGO} alt="C-DAC" className="logo-cdac" />
            <div className="org-rule" />
            <img src={HAL_LOGO} alt="HAL" className="logo-hal" />
          </div>
          
          <h1 style={{ marginBottom: 4 }}>
            Update your password
          </h1>
          {user?.must_change_password && (
            <p className="login-sub" style={{ marginBottom: 24, color: 'var(--ink-muted)' }}>
              Your administrator requires you to change your password before continuing.
            </p>
          )}

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}

            <div className="field-icon">
              <LockIcon />
              <input
                id="current_password"
                type="password"
                aria-label="Current Password"
                placeholder="Current Password"
                autoComplete="current-password"
                autoFocus
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>

            <div className="field-icon">
              <LockIcon />
              <input
                id="new_password"
                type="password"
                aria-label="New Password"
                placeholder="New Password (min 12 characters)"
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="field-icon">
              <LockIcon />
              <input
                id="confirm_password"
                type="password"
                aria-label="Confirm New Password"
                placeholder="Confirm New Password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Update Password'}
            </button>
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
