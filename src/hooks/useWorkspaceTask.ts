"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SSEEvent } from "@/lib/agent-client";
import { friendlyAgentError } from "@/lib/agent-errors";

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

function attachStreamListeners(
  es: EventSource,
  skill: string,
  clearStreamTimeout: () => void,
  safeSetState: (action: WorkspaceTaskState | ((s: WorkspaceTaskState) => WorkspaceTaskState)) => void,
  eventSourceRef: React.MutableRefObject<EventSource | null>,
) {
  es.addEventListener("status", () => {
    safeSetState((s) => ({
      ...s,
      status: "streaming",
      progressText: `Running ${skill}...`,
    }));
  });

  es.addEventListener("progress", (e) => {
    let data: { message: string };
    try { data = JSON.parse((e as MessageEvent).data); } catch { return; }
    safeSetState((s) => ({
      ...s,
      progressText: data.message,
    }));
  });

  es.addEventListener("tool_call", (e) => {
    let data: ToolCallEvent;
    try { data = JSON.parse((e as MessageEvent).data); } catch { return; }
    safeSetState((s) => ({
      ...s,
      toolCalls: [...s.toolCalls, data],
      progressText: `Using ${data.tool.replace("mcp__jira__", "").replace("mcp__", "")}...`,
    }));
  });

  es.addEventListener("result", (e) => {
    clearStreamTimeout();
    let data: { output: string; status: string };
    try { data = JSON.parse((e as MessageEvent).data); } catch { return; }
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
    clearStreamTimeout();
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
    clearStreamTimeout();
    es.close();
    eventSourceRef.current = null;
  });
}

export function useWorkspaceTask(conversationId?: string): UseWorkspaceTaskReturn {
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

  // On mount (or when conversationId changes), check for active tasks so the
  // UI can reconnect to a stream that was running when the user navigated away.
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    async function checkActiveTasks() {
      const res = await fetch(
        `/api/workspace-tasks?conversationId=${encodeURIComponent(conversationId!)}`
      );
      if (!res.ok || cancelled) return;
      const rows = await res.json() as Array<{
        id: string;
        skillName: string;
        status: string;
        output: string | null;
        error: string | null;
      }>;

      if (cancelled) return;

      // Find the most recent non-idle task
      const running = rows.find((r) => r.status === "running");
      const recentCompleted = rows.find((r) => r.status === "completed");
      const recentFailed = rows.find((r) => r.status === "failed");

      if (running) {
        safeSetState({
          ...initialState,
          status: "streaming",
          taskId: running.id,
          skill: running.skillName,
          progressText: `Running ${running.skillName}...`,
        });

        // Reconnect to the SSE stream for live progress
        const es = new EventSource(`/api/workspace-tasks/${running.id}/stream`);
        eventSourceRef.current = es;

        const streamTimeout = setTimeout(() => {
          es.close();
          eventSourceRef.current = null;
          safeSetState((s) => ({
            ...s,
            status: "failed",
            error: "Task timed out after 5 minutes",
            progressText: "",
          }));
        }, 5 * 60 * 1000);

        attachStreamListeners(
          es,
          running.skillName,
          () => clearTimeout(streamTimeout),
          safeSetState,
          eventSourceRef,
        );
        return;
      }

      if (recentCompleted?.output) {
        // Task completed server-side; message was already saved by captureTaskStream.
        // Show completed state so caller can trigger a message refresh.
        safeSetState({
          ...initialState,
          status: "completed",
          taskId: recentCompleted.id,
          skill: recentCompleted.skillName,
          output: recentCompleted.output,
        });
        return;
      }

      if (recentFailed) {
        safeSetState({
          ...initialState,
          status: "failed",
          taskId: recentFailed.id,
          skill: recentFailed.skillName,
          error: recentFailed.error ?? "Task failed",
        });
      }
    }

    checkActiveTasks().catch(() => {
      // Silently ignore fetch errors during reconnect check
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const submitAndStream = useCallback(
    async (skill: string, args: Record<string, string>, convId?: string) => {
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
          body: JSON.stringify({ skill, args, ...(convId ? { conversationId: convId } : {}) }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          safeSetState((s) => ({
            ...s,
            status: "failed",
            error: friendlyAgentError(body, `Submit failed (${res.status})`),
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

        // Open SSE stream with a 5-minute timeout to detect hung tasks
        const es = new EventSource(`/api/workspace-tasks/${taskId}/stream`);
        eventSourceRef.current = es;

        const streamTimeout = setTimeout(() => {
          es.close();
          eventSourceRef.current = null;
          safeSetState((s) => ({
            ...s,
            status: "failed",
            error: "Task timed out after 5 minutes",
            progressText: "",
          }));
        }, 5 * 60 * 1000);

        attachStreamListeners(
          es,
          skill,
          () => clearTimeout(streamTimeout),
          safeSetState,
          eventSourceRef,
        );
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
