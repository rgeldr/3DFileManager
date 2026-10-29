import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_THEME, isThemeName, type ThemeName } from "./themes";

const STORAGE_KEY = "3dfl-theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
}

export function ThemeProvider({
  initial,
  children,
}: {
  initial?: ThemeName;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeName>(initial ?? DEFAULT_THEME);

  const setTheme = useCallback((next: ThemeName) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export function readStoredTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isThemeName(saved)) return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}
