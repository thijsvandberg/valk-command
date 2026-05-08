"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "theme";
const THEME_COLOR_DARK = "#0b1316";
const THEME_COLOR_LIGHT = "#f4f8f8";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch { /* noop */ }
  return null;
}

function resolveTheme(): Theme {
  return getStoredTheme() ?? resolveSystemTheme();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  }
}

function subscribeToTheme(callback: () => void) {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  const handleCustom = () => callback();
  const mql = window.matchMedia("(prefers-color-scheme: light)");
  const handleSystem = () => {
    if (!getStoredTheme()) callback();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener("theme-change", handleCustom);
  mql.addEventListener("change", handleSystem);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("theme-change", handleCustom);
    mql.removeEventListener("change", handleSystem);
  };
}

function getThemeSnapshot(): Theme {
  const t = resolveTheme();
  applyTheme(t);
  return t;
}

function getThemeServerSnapshot(): Theme {
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch { /* noop */ }
    applyTheme(t);
    window.dispatchEvent(new Event("theme-change"));
  }, []);

  const toggleTheme = useCallback(() => {
    const current = resolveTheme();
    const next = current === "dark" ? "light" : "dark";

    document.documentElement.classList.add("theme-transition");
    setTheme(next);
    setTimeout(() => {
      document.documentElement.classList.remove("theme-transition");
    }, 250);
  }, [setTheme]);

  return (
    <ThemeContext value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
