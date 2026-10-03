import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeName = 'dark' | 'light';

export const ACCENTS = [
  { name: 'Teal', value: '#3cc8b4' },
  { name: 'Blue', value: '#5b8def' },
  { name: 'Violet', value: '#9b7bea' },
  { name: 'Pink', value: '#e86fa6' },
  { name: 'Orange', value: '#ef8a4c' },
  { name: 'Yellow', value: '#e3c04a' },
  { name: 'Green', value: '#6cc56f' },
];

interface ThemeState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  accent: string;
  setAccent: (a: string) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode etc.) — preference just won't persist
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => (read('vo-theme') === 'light' ? 'light' : 'dark'));
  const [accent, setAccent] = useState(() => read('vo-accent') ?? ACCENTS[0].value);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    write('vo-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent);
    write('vo-accent', accent);
  }, [accent]);

  return <ThemeContext.Provider value={{ theme, setTheme, accent, setAccent }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}
