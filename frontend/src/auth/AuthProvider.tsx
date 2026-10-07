import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi, type CurrentUser } from '@/api/auth';
import { ApiError } from '@/api/client';

type Status = 'loading' | 'ready';

interface AuthContextValue {
  user: CurrentUser | null;
  status: Status;
  signIn: (username: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session state lives on the server. Nothing is kept in localStorage — the
 * cookie is httpOnly and unreadable here, so the only way to know who is
 * signed in is to ask. `/auth/me` is called once on mount; a 401 from it is
 * the ordinary signed-out answer, not an error condition.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const refresh = useCallback(async () => {
    try {
      setUser(await authApi.me());
    } catch (err) {
      if (!(err instanceof ApiError)) {
        console.error('Unexpected error resolving session', err);
      }
      setUser(null);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (username: string, password: string, remember: boolean) => {
      setUser(await authApi.login(username, password, remember));
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, signIn, signOut, refresh }),
    [user, status, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
