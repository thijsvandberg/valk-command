"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

export interface WorkspaceHealth {
  workspace: "connected" | "unreachable" | "checking";
  claude: "valid" | "expired" | "no_credentials" | "unknown" | "checking";
  tokenExpiresAt: string | null;
}

async function fetchHealth(): Promise<WorkspaceHealth> {
  try {
    const data = await apiFetch<{ status?: string; auth?: { status?: string; tokenExpiresAt?: string } }>("/api/workspace-tasks/health");

    if (data.status === "unreachable") {
      return { workspace: "unreachable", claude: "unknown", tokenExpiresAt: null };
    }

    return {
      workspace: "connected",
      claude: (data.auth?.status as WorkspaceHealth["claude"]) ?? "unknown",
      tokenExpiresAt: data.auth?.tokenExpiresAt ?? null,
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 502) {
      return { workspace: "unreachable", claude: "unknown", tokenExpiresAt: null };
    }
    return { workspace: "unreachable", claude: "unknown", tokenExpiresAt: null };
  }
}

// Mounted hook instances register their check here so non-hook callers (e.g.
// a failed send in useStoryWriter) can force an immediate re-check instead of
// leaving the UI stale until the next poll tick (BRDG-459).
const healthCheckListeners = new Set<() => void>();

export function triggerWorkspaceHealthCheck(): void {
  for (const listener of healthCheckListeners) listener();
}

export function useWorkspaceHealth(pollInterval = 30_000): WorkspaceHealth {
  const [health, setHealth] = useState<WorkspaceHealth>({
    workspace: "checking",
    claude: "checking",
    tokenExpiresAt: null,
  });

  const mountedRef = useRef(true);

  const check = useCallback(async () => {
    const result = await fetchHealth();
    if (mountedRef.current) setHealth(result);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    fetchHealth().then((result) => {
      if (mountedRef.current) setHealth(result);
    });

    const id = setInterval(() => {
      // Don't poll a hidden tab; resume on the next visibilitychange instead.
      if (typeof document !== "undefined" && document.hidden) return;
      check();
    }, pollInterval);

    // Re-check immediately when the tab becomes visible so a long-hidden tab is
    // not left showing stale health until the next interval tick.
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    healthCheckListeners.add(check);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      healthCheckListeners.delete(check);
    };
  }, [check, pollInterval]);

  return health;
}
