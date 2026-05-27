"use client";

import { useCallback, useEffect } from "react";
import { useLocalStorage } from "./useLocalStorage";

const COLLAPSED_KEY = "bridge:sidebar-collapsed";
const WIDTH_KEY = "bridge:sidebar-width";
const DEFAULT_WIDTH = 288;
const MIN_WIDTH = 200;
const MAX_WIDTH = 500;
const COLLAPSED_WIDTH = 48;

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
  const [collapsed, setCollapsed] = useLocalStorage(COLLAPSED_KEY, false);
  const [width, setWidthRaw] = useLocalStorage(WIDTH_KEY, DEFAULT_WIDTH);

  const clampWidth = useCallback((w: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)), []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, [setCollapsed]);

  const setWidth = useCallback((w: number) => {
    const clamped = clampWidth(w);
    setWidthRaw(clamped);
  }, [clampWidth, setWidthRaw]);

  const resetWidth = useCallback(() => {
    setWidthRaw(DEFAULT_WIDTH);
  }, [setWidthRaw]);

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
