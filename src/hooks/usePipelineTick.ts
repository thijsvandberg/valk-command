"use client";

import { useEffect, useRef, useCallback } from "react";
import { mutate as globalMutate } from "swr";
import { pipelines as pipelinesApi } from "@/lib/api-client";

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
      const data = await pipelinesApi.tick() as Record<string, unknown>;
      if (!mountedRef.current) return;

      // If sync actually ran and found new data, revalidate pipeline caches
      const hasNewPipelineData = (data.newRuns as number) > 0 || (data.updatedRuns as number) > 0;
      const prSync = data.prSync as Record<string, number> | undefined;
      const hasNewPrData = (prSync?.newOpened ?? 0) > 0 || (prSync?.newMerged ?? 0) > 0;
      if (data.ran && (hasNewPipelineData || hasNewPrData)) {
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
