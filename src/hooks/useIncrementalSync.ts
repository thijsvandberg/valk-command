"use client";

import { useEffect, useRef, useState } from "react";
import { mutate as globalMutate } from "swr";

const INTERVAL_MS = 150_000;

interface IncrementalSyncResult {
  ok: boolean;
  count?: number;
  checked?: number;
  remaining?: number;
  skipped?: boolean;
  needsFullSync?: boolean;
  tickets?: string[];
}

/**
 * Polls POST /api/jira/sync-incremental every 150s via setInterval.
 * Server enforces a 120s cooldown, so duplicate client calls are harmless.
 */
export function useIncrementalSync(onSyncComplete?: () => void) {
  const onCompleteRef = useRef(onSyncComplete);
  onCompleteRef.current = onSyncComplete;
  const runningRef = useRef(false);

  const [remaining, setRemaining] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function runSync() {
      if (runningRef.current) return;
      if (document.visibilityState !== "visible") return;

      runningRef.current = true;
      try {
        const res = await fetch("/api/jira/sync-incremental", { method: "POST" });
        if (!res.ok || !mounted) return;

        const data: IncrementalSyncResult = await res.json();
        if (!mounted || data.skipped) return;

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

    runSync();
    const id = setInterval(runSync, INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return { remaining, lastSyncAt, lastSyncCount };
}
