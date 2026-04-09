"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { mutate as globalMutate } from "swr";

const TICK_INTERVAL_MS = 30_000;

interface TickResponse {
  ran: string[];
  results: Record<string, Record<string, unknown>>;
  checked: number;
}

/**
 * Fires POST /api/scheduler/tick on mount, on visibility change,
 * and every 30s. This drives the lazy-cron scheduler which handles
 * incremental Jira sync, ticket cleanup, and any future tasks.
 *
 * Exposes incremental sync state for backward compatibility with
 * the ActivityContext.
 */
export function useSchedulerTick(onSyncComplete?: () => void) {
  const onCompleteRef = useRef(onSyncComplete);
  onCompleteRef.current = onSyncComplete;

  const [remaining, setRemaining] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const runTick = useCallback(async () => {
    if (runningRef.current) return;
    if (document.visibilityState !== "visible") return;

    runningRef.current = true;
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/scheduler/tick", {
        method: "POST",
        signal: abortRef.current.signal,
      });
      if (!res.ok || !mountedRef.current) return;

      const data: TickResponse = await res.json();
      if (!mountedRef.current) return;

      // Extract incremental sync results if it ran
      const syncResult = data.results?.["incremental-sync"];
      if (syncResult) {
        setRemaining(
          typeof syncResult.remaining === "number" ? syncResult.remaining : 0,
        );
        setLastSyncAt(new Date().toISOString());
        setLastSyncCount(
          typeof syncResult.count === "number" ? syncResult.count : 0,
        );

        if (
          typeof syncResult.count === "number" &&
          syncResult.count > 0
        ) {
          globalMutate((key: unknown) =>
            typeof key === "string" &&
            (key.startsWith("/api/tickets") ||
              key.startsWith("/api/activity-log")),
          );
          onCompleteRef.current?.();
        }
      }

      // If cleanup ran, also invalidate ticket caches
      if (data.ran.includes("cleanup-removed-tickets")) {
        globalMutate((key: unknown) =>
          typeof key === "string" && key.startsWith("/api/tickets"),
        );
      }
    } catch {
      // Background tick, fail silently
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    runTick();
    const id = setInterval(runTick, TICK_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        runTick();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [runTick]);

  return { remaining, lastSyncAt, lastSyncCount };
}
