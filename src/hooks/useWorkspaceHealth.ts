"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface WorkspaceHealth {
  workspace: "connected" | "unreachable" | "checking";
  claude: "valid" | "expired" | "no_credentials" | "unknown" | "checking";
  tokenExpiresAt: string | null;
}

async function fetchHealth(): Promise<WorkspaceHealth> {
  try {
    const res = await fetch("/api/workspace-tasks/health");
    const data = await res.json();

    if (res.status === 502 || data.status === "unreachable") {
      return { workspace: "unreachable", claude: "unknown", tokenExpiresAt: null };
    }

    return {
      workspace: "connected",
      claude: data.auth?.status ?? "unknown",
      tokenExpiresAt: data.auth?.tokenExpiresAt ?? null,
    };
  } catch {
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
