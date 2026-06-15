"use client";

import useSWR, { mutate } from "swr";
import { useCallback, useEffect, useRef } from "react";
import { apiFetch, swrFetcher } from "@/lib/api-client";

/**
 * Read/write a per-account setting backed by a `{ value }` JSON endpoint built
 * with `createUserJsonSettingRoute` (BRDG-343). Mirrors the `useLocalStorage`
 * tuple ergonomics ([value, setValue]) so a localStorage-backed preference can
 * be moved server-side with a near drop-in swap, while the value now follows the
 * Clerk account across browsers/ports/devices instead of the browser origin.
 *
 * Writes are optimistic and persisted via PUT; a failed write rolls back to the
 * last server value. SWR revalidates on focus so a value changed in another
 * context (another port/tab) is picked up.
 */
export function useAccountSetting<T>(
  url: string,
  defaultValue: T,
): { value: T; setValue: (next: T | ((prev: T) => T)) => void; isLoading: boolean } {
  const { data, isLoading } = useSWR<{ value: T }>(url, swrFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });

  const value = data?.value ?? defaultValue;

  // Keep the latest value addressable inside functional updaters without
  // re-creating setValue on every change.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(valueRef.current) : next;
      void mutate(
        url,
        apiFetch<{ value: T }>(url, { method: "PUT", body: { value: resolved } }).catch(
          () => ({ value: valueRef.current }),
        ),
        { optimisticData: { value: resolved }, revalidate: false, rollbackOnError: true },
      );
    },
    [url],
  );

  return { value, setValue, isLoading };
}
