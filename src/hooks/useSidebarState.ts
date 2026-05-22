"use client";

import { useState, useCallback, useEffect } from "react";

const COLLAPSED_KEY = "bridge:sidebar-collapsed";
const WIDTH_KEY = "bridge:sidebar-width";
const DEFAULT_WIDTH = 288;
const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const COLLAPSED_WIDTH = 48;

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or unavailable
  }
}

export interface SidebarState {
  collapsed: boolean;
  width: number;
  effectiveWidth: number;
  toggleCollapsed: () => void;
  setWidth: (w: number) => void;
  resetWidth: () => void;
  clampWidth: (w: number) => number;
}

export function useSidebarState(): SidebarState {
  const [collapsed, setCollapsed] = useState(() => readLocalStorage(COLLAPSED_KEY, false));
  const [width, setWidthRaw] = useState(() => readLocalStorage(WIDTH_KEY, DEFAULT_WIDTH));

  const clampWidth = useCallback((w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)), []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeLocalStorage(COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const setWidth = useCallback((w: number) => {
    const clamped = clampWidth(w);
    setWidthRaw(clamped);
    writeLocalStorage(WIDTH_KEY, clamped);
  }, [clampWidth]);

  const resetWidth = useCallback(() => {
    setWidthRaw(DEFAULT_WIDTH);
    writeLocalStorage(WIDTH_KEY, DEFAULT_WIDTH);
  }, []);

  // Cmd/Ctrl + B keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCollapsed]);

  const effectiveWidth = collapsed ? COLLAPSED_WIDTH : width;

  return { collapsed, width, effectiveWidth, toggleCollapsed, setWidth, resetWidth, clampWidth };
}

export { MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH, COLLAPSED_WIDTH };
