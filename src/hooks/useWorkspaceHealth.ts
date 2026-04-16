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

    const id = setInterval(check, pollInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [check, pollInterval]);

  return health;
}
