"use client";

import { useState, useCallback, useRef } from "react";
import type { SSEEvent } from "@/lib/agent-client";

export type TaskStreamStatus = "idle" | "submitting" | "streaming" | "completed" | "failed";

interface ToolCallEvent {
  tool: string;
  id: string;
  args: string;
}

export interface WorkspaceTaskState {
  status: TaskStreamStatus;
  taskId: string | null;
  skill: string | null;
  toolCalls: ToolCallEvent[];
  progressText: string;
  output: string | null;
  error: string | null;
}

interface UseWorkspaceTaskReturn extends WorkspaceTaskState {
  submitAndStream: (
    skill: string,
    args: Record<string, string>,
    conversationId: string
  ) => Promise<void>;
  reset: () => void;
}

const initialState: WorkspaceTaskState = {
  status: "idle",
  taskId: null,
  skill: null,
  toolCalls: [],
  progressText: "",
  output: null,
  error: null,
};

export function useWorkspaceTask(): UseWorkspaceTaskReturn {
  const [state, setState] = useState<WorkspaceTaskState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setState(initialState);
  }, []);

  const submitAndStream = useCallback(
    async (skill: string, args: Record<string, string>, conversationId: string) => {
      // Clean up previous stream
      eventSourceRef.current?.close();
      eventSourceRef.current = null;

      setState({
        ...initialState,
        status: "submitting",
        skill,
      });

      try {
        const res = await fetch("/api/workspace-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill, args, conversationId }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState((s) => ({
            ...s,
            status: "failed",
            error: body.error ?? `Submit failed (${res.status})`,
          }));
          return;
        }

        const task = await res.json();
        const taskId = task.id as string;

        setState((s) => ({
          ...s,
          status: "streaming",
          taskId,
        }));

        // Open SSE stream
        const es = new EventSource(`/api/workspace-tasks/${taskId}/stream`);
        eventSourceRef.current = es;

        es.addEventListener("status", (e) => {
          const data = JSON.parse(e.data) as Record<string, unknown>;
          setState((s) => ({
            ...s,
            status: "streaming",
            progressText: `Running ${skill}...`,
            ...(data.sessionId ? {} : {}),
          }));
        });

        es.addEventListener("progress", (e) => {
          const data = JSON.parse(e.data) as { message: string };
          setState((s) => ({
            ...s,
            progressText: data.message,
          }));
        });

        es.addEventListener("tool_call", (e) => {
          const data = JSON.parse(e.data) as ToolCallEvent;
          setState((s) => ({
            ...s,
            toolCalls: [...s.toolCalls, data],
            progressText: `Using ${data.tool.replace("mcp__jira__", "").replace("mcp__", "")}...`,
          }));
        });

        es.addEventListener("result", (e) => {
          const data = JSON.parse(e.data) as { output: string; status: string };
          setState((s) => ({
            ...s,
            status: "completed",
            output: data.output,
            progressText: "",
          }));
          es.close();
          eventSourceRef.current = null;
        });

        es.addEventListener("error", (e) => {
          if (e instanceof MessageEvent) {
            const data = JSON.parse(e.data) as { message: string };
            setState((s) => ({
              ...s,
              status: "failed",
              error: data.message,
              progressText: "",
            }));
          } else {
            setState((s) => ({
              ...s,
              status: "failed",
              error: "Connection lost",
              progressText: "",
            }));
          }
          es.close();
          eventSourceRef.current = null;
        });

        es.addEventListener("done", () => {
          es.close();
          eventSourceRef.current = null;
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    },
    []
  );

  return {
    ...state,
    submitAndStream,
    reset,
  };
}
