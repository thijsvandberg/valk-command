"use client";

import useSWR from "swr";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

// Local fetcher over apiFetch (rather than importing swrFetcher) so a test that
// mocks @/lib/api-client only has to provide apiFetch, not every named export.
const settingFetcher = <T>(url: string): Promise<{ value: T }> => apiFetch<{ value: T }>(url);

function jsonEquals<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Read/write a per-account setting backed by a `{ value }` JSON endpoint built
 * with `createUserJsonSettingRoute` (BRDG-343). Mirrors the `useLocalStorage`
 * tuple ergonomics ([value, setValue]) so a localStorage-backed preference can
 * be moved server-side with a near drop-in swap, while the value now follows the
 * Clerk account across browsers/ports/devices instead of the browser origin.
 *
 * setValue applies synchronously via a local pending mirror (so the UI updates
 * instantly, like useLocalStorage did) and persists via PUT in the background.
 * The mirror is kept (not cleared eagerly) so an in-flight GET that resolves
 * after the write cannot clobber it; it is reconciled away only once the server
 * value actually matches. A failed write clears the mirror, rolling back to the
 * last server value. SWR revalidates on focus so a value changed in another
 * port/tab is picked up once the local write has been reconciled.
 */
export function useAccountSetting<T>(
  url: string,
  defaultValue: T,
): { value: T; setValue: (next: T | ((prev: T) => T)) => void; isLoading: boolean } {
  const { data, isLoading, mutate: revalidate } = useSWR<{ value: T }>(url, settingFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
  });

  const serverValue = data?.value ?? defaultValue;

  // Local optimistic mirror: holds the most recent value written this session so
  // the consumer sees the change synchronously and it survives an in-flight GET.
  const [pending, setPending] = useState<{ value: T } | null>(null);

  // Reconcile the mirror away once the server has caught up to it (a stale GET
  // returning a different value is ignored, so it can't clobber a fresh write).
  // Done as an adjust-state-during-render so it re-enables focus revalidation /
  // cross-tab updates without a set-state-in-effect; it converges immediately
  // because the next render sees pending === null.
  if (pending && jsonEquals(serverValue, pending.value)) {
    setPending(null);
  }

  const value = pending ? pending.value : serverValue;

  // Keep the latest value addressable inside functional updaters without
  // re-creating setValue on every change.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Identifies the most recent write so a slow earlier PUT can't fold a stale
  // value over a newer one (rapid toggles).
  const writeIdRef = useRef(0);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(valueRef.current) : next;
      // No-op when the value is unchanged, matching useLocalStorage/useState
      // semantics. Without this an effect that re-sets the current value (e.g. a
      // URL<->state sync) would loop forever, since each call would otherwise
      // create a fresh pending object and re-trigger downstream memos/effects.
      if (jsonEquals(resolved, valueRef.current)) return;
      setPending({ value: resolved });
      const writeId = ++writeIdRef.current;
      apiFetch<{ value: T }>(url, { method: "PUT", body: { value: resolved } })
        .then(() => {
          // Fold the confirmed write into the SWR cache; the reconcile effect
          // then clears the mirror once serverValue matches.
          if (writeId === writeIdRef.current) void revalidate({ value: resolved }, { revalidate: false });
        })
        .catch(() => {
          // Roll back to the server value on failure.
          if (writeId === writeIdRef.current) setPending(null);
        });
    },
    [url, revalidate],
  );

  return { value, setValue, isLoading };
}
