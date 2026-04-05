"use client";

import { useState, useCallback, useEffect } from "react";

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

  useEffect(() => {
    setStoredValue(readValue(key, defaultValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Sync across tabs via storage event
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== key) return;
      setStoredValue(e.newValue === null ? defaultValue : readValue(key, defaultValue));
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key, defaultValue]);

  return [storedValue, setValue];
}
