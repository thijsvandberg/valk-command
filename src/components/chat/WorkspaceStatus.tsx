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
  const { workspace, claude } = useWorkspaceHealth();

  const wsColor =
    workspace === "connected" ? "#34d399" :
    workspace === "unreachable" ? "#f87171" : "#94a3b8";

  const wsLabel =
    workspace === "connected" ? "Remote workspace" :
    workspace === "unreachable" ? "Workspace unreachable" : "Checking...";

  const clColor =
    claude === "valid" ? "#34d399" :
    claude === "expired" || claude === "no_credentials" ? "#f87171" :
    "#94a3b8";

  const clLabel =
    claude === "valid" ? "Claude connected" :
    claude === "expired" ? "Claude token expired" :
    claude === "no_credentials" ? "Claude not logged in" :
    claude === "checking" ? "Checking..." : "Claude status unknown";

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border-default text-label text-text-tertiary">
      <span className="inline-flex items-center gap-1.5">
        <Dot color={wsColor} />
        {wsLabel}
      </span>
      {workspace === "connected" && (
        <span className="inline-flex items-center gap-1.5">
          <Dot color={clColor} />
          {clLabel}
        </span>
      )}
    </div>
  );
}
