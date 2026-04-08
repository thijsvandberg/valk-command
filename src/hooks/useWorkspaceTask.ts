"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
    conversationId?: string
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
  const unmountedRef = useRef(false);

  // Cleanup on unmount: close EventSource and prevent further setState calls
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  const safeSetState: typeof setState = useCallback((action) => {
    if (!unmountedRef.current) setState(action);
  }, []);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    safeSetState(initialState);
  }, [safeSetState]);

  const submitAndStream = useCallback(
    async (skill: string, args: Record<string, string>, conversationId?: string) => {
      // Clean up previous stream
      eventSourceRef.current?.close();
      eventSourceRef.current = null;

      safeSetState({
        ...initialState,
        status: "submitting",
        skill,
      });

      try {
        const res = await fetch("/api/workspace-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill, args, ...(conversationId ? { conversationId } : {}) }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          safeSetState((s) => ({
            ...s,
            status: "failed",
            error: body.error ?? `Submit failed (${res.status})`,
          }));
          return;
        }

        const task = await res.json();
        const taskId = task.id as string;

        safeSetState((s) => ({
          ...s,
          status: "streaming",
          taskId,
        }));

        // Open SSE stream
        const es = new EventSource(`/api/workspace-tasks/${taskId}/stream`);
        eventSourceRef.current = es;

        es.addEventListener("status", (e) => {
          try {
            JSON.parse(e.data);
          } catch { return; }
          safeSetState((s) => ({
            ...s,
            status: "streaming",
            progressText: `Running ${skill}...`,
          }));
        });

        es.addEventListener("progress", (e) => {
          let data: { message: string };
          try { data = JSON.parse(e.data); } catch { return; }
          safeSetState((s) => ({
            ...s,
            progressText: data.message,
          }));
        });

        es.addEventListener("tool_call", (e) => {
          let data: ToolCallEvent;
          try { data = JSON.parse(e.data); } catch { return; }
          safeSetState((s) => ({
            ...s,
            toolCalls: [...s.toolCalls, data],
            progressText: `Using ${data.tool.replace("mcp__jira__", "").replace("mcp__", "")}...`,
          }));
        });

        es.addEventListener("result", (e) => {
          let data: { output: string; status: string };
          try { data = JSON.parse(e.data); } catch { return; }
          safeSetState((s) => ({
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
            let data: { message: string };
            try { data = JSON.parse(e.data); } catch {
              safeSetState((s) => ({ ...s, status: "failed", error: "Unknown error", progressText: "" }));
              es.close();
              eventSourceRef.current = null;
              return;
            }
            safeSetState((s) => ({
              ...s,
              status: "failed",
              error: data.message,
              progressText: "",
            }));
          } else {
            safeSetState((s) => ({
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
        safeSetState((s) => ({
          ...s,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    },
    [safeSetState]
  );

  return {
    ...state,
    submitAndStream,
    reset,
  };
}
