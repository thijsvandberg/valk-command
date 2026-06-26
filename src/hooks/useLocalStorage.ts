"use client";

import { useState, useCallback, useEffect, useRef } from "react";

function readValue<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  // Initialize with defaultValue to match SSR output, then hydrate from localStorage
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
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Storage full or unavailable
        }
        return next;
      });
    },
    [key],
  );

  // Sync across tabs via storage event. Read the default from the ref and depend
  // only on `key`: depending on `defaultValue` re-subscribed the listener on every
  // render for callers passing an object/array literal (a fresh reference each time),
  // which `defaultValueRef` already exists to avoid.
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== key) return;
      setStoredValue(e.newValue === null ? defaultValueRef.current : readValue(key, defaultValueRef.current));
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key]);

  return [storedValue, setValue];
}
