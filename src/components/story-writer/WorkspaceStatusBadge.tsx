"use client";

import { useWorkspaceHealth } from "@/hooks/useWorkspaceHealth";
import { friendlyAgentError } from "@/lib/agent-errors";
import { Tooltip } from "@/components/shared/Tooltip";

/**
 * Problem-only workspace indicator for the story writer chat toolbar (BRDG-459):
 * renders nothing while the workspace is healthy so the toolbar stays quiet,
 * and a red dot + short label with hover detail when it is unreachable.
 */
export function WorkspaceStatusBadge() {
  const { workspace } = useWorkspaceHealth();

  if (workspace !== "unreachable") return null;

  return (
    <Tooltip content={friendlyAgentError({ code: "UNREACHABLE" })}>
      <span className="ml-1 inline-flex items-center gap-1.5 text-caption text-[var(--color-status-error)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-status-error)]" />
        Workspace offline
      </span>
    </Tooltip>
  );
}
