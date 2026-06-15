"use client";

import { useEffect, useRef } from "react";
import { useAccountSetting } from "@/hooks/useAccountSetting";

function jsonEquals<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type MigrationOptions<T> = {
  // How to parse the legacy localStorage string. Defaults to JSON.parse.
  parse?: (raw: string) => T;
  // Whether the current server value is still "untouched". When true the legacy
  // local value is imported; when false it is skipped so a value the user
  // already set on another device is never clobbered. Defaults to deep-equality
  // against defaultValue.
  isDefault?: (serverValue: T) => boolean;
  // For array-like settings that can be merged safely (e.g. by id) rather than
  // replaced. When provided it always runs and the default-guard is skipped.
  merge?: (serverValue: T, localValue: T) => T;
};

/**
 * Account-scoped setting with a one-time, idempotent import of a value left in
 * this browser's localStorage (BRDG-343). Generalizes useSavedViews for scalar
 * and object preferences: because those cannot be merged by id, the legacy local
 * value is imported only when the server value is still the default (the user
 * never wrote it from another device), so an account value is never clobbered.
 * The import runs at most once per browser, guarded by a `<localKey>-migrated`
 * flag, and tolerates absent/corrupt localStorage.
 *
 * Pass a module-level constant for `defaultValue` and `options` so identity is
 * stable across renders.
 */
export function useMigratedAccountSetting<T>(
  url: string,
  localKey: string,
  defaultValue: T,
  options?: MigrationOptions<T>,
): { value: T; setValue: (next: T | ((prev: T) => T)) => void; isLoading: boolean } {
  const { value, setValue, isLoading } = useAccountSetting<T>(url, defaultValue);

  // Mirror the latest settled server value into a ref so the once-only migration
  // effect can read it without listing it as a dependency (matches the pattern
  // in useAccountSetting and keeps the effect from re-running on every change).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const migratedRef = useRef(false);
  useEffect(() => {
    if (isLoading || migratedRef.current) return;
    migratedRef.current = true;
    const migratedFlag = `${localKey}-migrated`;
    try {
      if (localStorage.getItem(migratedFlag) === "1") return;
      const raw = localStorage.getItem(localKey);
      if (raw !== null) {
        const localValue = options?.parse ? options.parse(raw) : (JSON.parse(raw) as T);
        if (options?.merge) {
          const merge = options.merge;
          setValue((prev) => merge(prev, localValue));
        } else {
          const untouched = options?.isDefault
            ? options.isDefault(valueRef.current)
            : jsonEquals(valueRef.current, defaultValue);
          if (untouched) setValue(localValue);
        }
      }
      localStorage.setItem(migratedFlag, "1");
    } catch {
      // localStorage unavailable or corrupt: nothing to migrate.
    }
  }, [isLoading, localKey, defaultValue, options, setValue]);

  return { value, setValue, isLoading };
}
