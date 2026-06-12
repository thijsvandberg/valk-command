"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { mutate as globalMutate } from "swr";
import { jira as jiraApi } from "@/lib/api-client";

const INTERVAL_MS = 150_000;

interface IncrementalSyncResult {
  ok: boolean;
  count?: number;
  checked?: number;
  remaining?: number;
  skipped?: boolean;
  needsFullSync?: boolean;
  tickets?: string[];
  sprintMetaRefreshed?: boolean;
}

/**
 * Polls POST /api/jira/sync-incremental every 150s via setInterval.
 * Server enforces a 120s cooldown, so duplicate client calls are harmless.
 * Triggers an immediate sync when the tab becomes visible.
 */
export function useIncrementalSync(onSyncComplete?: () => void) {
  const onCompleteRef = useRef(onSyncComplete);
  onCompleteRef.current = onSyncComplete;

  const [remaining, setRemaining] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncCount, setLastSyncCount] = useState(0);

  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const runSync = useCallback(async () => {
    if (runningRef.current) return;
    if (document.visibilityState !== "visible") return;

    runningRef.current = true;
    abortRef.current = new AbortController();
    try {
      const data = await jiraApi.syncIncremental(abortRef.current.signal) as IncrementalSyncResult;
      if (!mountedRef.current) return;

      if (data.skipped) {
        setLastSyncAt(new Date().toISOString());
        setRemaining(data.remaining ?? 0);
        setLastSyncCount(data.count ?? 0);
        return;
      }

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

      if (data.sprintMetaRefreshed) {
        globalMutate((key: unknown) =>
          typeof key === "string" && key.startsWith("/api/jira/sprints"),
        );
      }
    } catch {
      // Background sync, fail silently
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    runSync();
    const id = setInterval(runSync, INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        runSync();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [runSync]);

  return { remaining, lastSyncAt, lastSyncCount };
}
