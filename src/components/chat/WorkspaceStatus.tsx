"use client";

import { useWorkspaceHealth } from "@/hooks/useWorkspaceHealth";

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export default function WorkspaceStatus() {
  const { workspace } = useWorkspaceHealth();

  const wsColor =
    workspace === "connected" ? "var(--color-status-done)" :
    workspace === "unreachable" ? "var(--color-status-error)" : "var(--color-status-neutral)";

  const wsLabel =
    workspace === "connected" ? "Remote workspace" :
    workspace === "unreachable" ? "Workspace unreachable" : "Checking...";

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border-default text-label text-text-tertiary">
      <span className="inline-flex items-center gap-1.5">
        <Dot color={wsColor} />
        {wsLabel}
      </span>
    </div>
  );
}
