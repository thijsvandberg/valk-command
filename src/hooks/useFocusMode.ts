"use client";

import { useState, useEffect, useCallback } from "react";

export function useFocusMode() {
  const [focusMode, setFocusMode] = useState(false);

  const toggleFocusMode = useCallback(() => setFocusMode((prev) => !prev), []);
  const exitFocusMode = useCallback(() => setFocusMode(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setFocusMode((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { focusMode, toggleFocusMode, exitFocusMode } as const;
}
