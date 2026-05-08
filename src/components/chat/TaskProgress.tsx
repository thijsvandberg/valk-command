"use client";

import type { TaskStreamStatus } from "@/hooks/useWorkspaceTask";
import { Tag } from "@/components/shared/Tag";

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
}: TaskProgressProps) {
  if (status === "idle" || status === "completed") return null;

  return (
    <div className="border-t border-border-default px-6 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Status bar */}
        <div className="flex items-center gap-3">
          {status === "failed" ? (
            <div className="h-2 w-2 rounded-full bg-red-400" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-[var(--color-brand-400)] animate-pulse" />
          )}
          <span className="text-xs font-medium text-text-secondary">
            {status === "submitting" && `Submitting ${skill}...`}
            {status === "streaming" && (progressText
              ? progressText.slice(0, 80)
              : `Running ${skill}...`
            )}
            {status === "failed" && (error ?? "Task failed")}
          </span>
        </div>

        {/* Tool calls (compact list) */}
        {toolCalls.length > 0 && status === "streaming" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
