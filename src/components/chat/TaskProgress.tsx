"use client";

import { Square } from "lucide-react";
import type { TaskStreamStatus } from "@/hooks/useWorkspaceTask";
import { Tag } from "@/components/shared/Tag";
import { StreamingIndicator } from "@/components/shared/StreamingIndicator";

interface ToolCallEvent {
  tool: string;
  id: string;
  args: string;
}

interface TaskProgressProps {
  skill: string | null;
  status: TaskStreamStatus;
  progressText: string;
  toolCalls: ToolCallEvent[];
  error: string | null;
  onCancel?: () => void;
}

function formatToolName(tool: string): string {
  return tool
    .replace(/^mcp__jira__/, "")
    .replace(/^mcp__claude_ai_Atlassian__/, "")
    .replace(/^mcp__/, "")
    .replace(/_/g, " ");
}

export default function TaskProgress({
  skill,
  status,
  progressText,
  toolCalls,
  error,
  onCancel,
}: TaskProgressProps) {
  if (status === "idle" || status === "completed") return null;

  // Error state
  if (status === "failed") {
    return (
      <div className="border-t border-red-500/20 px-6 py-2.5">
        <div className="mx-auto max-w-3xl">
          <span className="text-body-sm text-red-400">{error ?? "Task failed"}</span>
        </div>
      </div>
    );
  }

  // Streaming / submitting state
  const label = progressText
    ? progressText.slice(0, 80)
    : status === "submitting"
      ? `Starting ${skill ?? "task"}...`
      : `Running ${skill ?? "task"}...`;

  return (
    <div className="border-t border-border-default px-6 py-2.5">
      <div className="mx-auto max-w-3xl space-y-2">
        <div className="flex items-center gap-2.5">
          <StreamingIndicator text={label} className="flex-1" />
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-caption text-text-tertiary cursor-pointer hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              aria-label="Cancel task"
              data-testid="task-progress-cancel"
            >
              <Square size={9} strokeWidth={2} fill="currentColor" />
              Stop
            </button>
          )}
        </div>

        {/* Tool calls (compact list) */}
        {toolCalls.length > 0 && status === "streaming" && (
          <div className="flex flex-wrap gap-1.5 pl-[18px]">
            {toolCalls.slice(-5).map((tc) => (
              <Tag key={tc.id} className="border border-border-subtle text-label text-text-tertiary">
                {formatToolName(tc.tool)}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
