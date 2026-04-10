"use client";

import { useEffect, useRef, useCallback } from "react";
import { mutate as globalMutate } from "swr";

const TICK_INTERVAL_MS = 60_000;

/**
 * Independent lazy-cron for pipeline sync. Fires POST /api/pipelines/tick
 * on mount, on visibility change, and every 60s. Runs separately from the
 * Jira scheduler tick to avoid blocking.
 *
 * The server-side tick checks its own 5-minute interval, so calling this
 * more frequently than 5 min is safe (the server skips if not due).
 */
export function usePipelineTick() {
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const runTick = useCallback(async () => {
    if (runningRef.current) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    runningRef.current = true;
    try {
      const res = await fetch("/api/pipelines/tick", { method: "POST" });
      if (!res.ok || !mountedRef.current) return;

      const data = await res.json();
      if (!mountedRef.current) return;

      // If sync actually ran and found new data, revalidate pipeline caches
      if (data.ran && (data.newRuns > 0 || data.updatedRuns > 0)) {
        globalMutate((key: unknown) =>
          typeof key === "string" && key.startsWith("/api/pipelines"),
        );
        globalMutate("/api/notifications?limit=50");
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
      if (document.visibilityState === "visible") runTick();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [runTick]);
}
