import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'sftad.dashboard.';

/**
 * useState that survives tab switches, navigation and reloads. Stored in the
 * browser only (localStorage), wrapped in try/catch because storage can be
 * blocked or empty; the dashboard then simply starts from its defaults.
 */
export function usePersistedState<T>(key: string, initial: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch { /* fall through to the default */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
  const set = useCallback((v: T | ((p: T) => T)) => setValue(v), []);
  return [value, set];
}
