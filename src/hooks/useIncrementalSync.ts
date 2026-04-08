"use client";

import { useEffect, useRef, useState } from "react";
import { mutate as globalMutate } from "swr";

const INTERVAL_MS = 150_000;

interface IncrementalSyncResult {
  ok: boolean;
  count?: number;
  checked?: number;
  remaining?: number;
  needsFullSync?: boolean;
  tickets?: string[];
}

/**
 * Triggers POST /api/jira/sync-incremental every 150s while the tab is visible.
 * Runs once immediately on mount, then every INTERVAL_MS.
 * Returns sync status for the UI.
 */
export function useIncrementalSync(onSyncComplete?: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const onCompleteRef = useRef(onSyncComplete);
  onCompleteRef.current = onSyncComplete;

  const [remaining, setRemaining] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  useEffect(() => {
    async function runSync() {
      if (runningRef.current) return;
      if (document.visibilityState !== "visible") return;

      runningRef.current = true;
      try {
        const res = await fetch("/api/jira/sync-incremental", { method: "POST" });
        if (!res.ok) return;

        const data: IncrementalSyncResult = await res.json();

        setRemaining(data.remaining ?? 0);
        setLastSyncAt(new Date().toISOString());
        setLastSyncCount(data.ok ? (data.count ?? 0) : 0);

        if (data.ok && data.count && data.count > 0) {
          globalMutate((key: unknown) =>
            typeof key === "string" && (
              key.startsWith("/api/tickets") ||
              key.startsWith("/api/activity-log")
            ),
          );
          onCompleteRef.current?.();
        }
      } catch {
        // Background sync, fail silently
      } finally {
        runningRef.current = false;
      }
    }

    function scheduleNext() {
      timerRef.current = setTimeout(async () => {
        await runSync();
        scheduleNext();
      }, INTERVAL_MS);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (!timerRef.current) {
          runSync();
          scheduleNext();
        }
      } else {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    }

    if (document.visibilityState === "visible") {
      runSync();
      scheduleNext();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { remaining, lastSyncAt, lastSyncCount };
}
