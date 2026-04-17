"use client";

import { useState, useCallback, useEffect, useRef } from "react";

function readValue<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

// Same interface as useLocalStorage but backed by sessionStorage.
// Values survive soft navigation within the tab but reset on hard refresh or new tab.
export function useSessionStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(defaultValue);
  // Capture defaultValue in a ref so callers can pass object literals without
  // triggering a re-hydration on every render.
  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    defaultValueRef.current = defaultValue;
  });

  useEffect(() => {
    setStoredValue(readValue(key, defaultValueRef.current));
  }, [key]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage full or unavailable
        }
        return next;
      });
    },
    [key],
  );

  return [storedValue, setValue];
}
