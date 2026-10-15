import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'sftad.theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable — fall through to system preference */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyThemeToDom(t: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
  }
}

// Initial synchronous application before components mount
if (typeof document !== 'undefined') {
  applyThemeToDom(initialTheme());
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = (next: Theme | ((prev: Theme) => Theme)) => {
    setThemeState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      applyThemeToDom(resolved);
      try {
        localStorage.setItem(STORAGE_KEY, resolved);
      } catch {
        /* non-fatal */
      }
      return resolved;
    });
  };

  useLayoutEffect(() => {
    applyThemeToDom(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* non-fatal */
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
