"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { attachTaskStreamListeners } from "./useStreamingTask";
import { workspaceTasks as workspaceTasksApi, ApiError } from "@/lib/api-client";

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
  /** Connect to an already-created task's SSE stream (used for follow-up messages). */
  streamExistingTask: (taskId: string, skill: string) => void;
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

export function useWorkspaceTask(conversationId?: string): UseWorkspaceTaskReturn {
  const [state, setState] = useState<WorkspaceTaskState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Cleanup on unmount: close EventSource, clear timeout, prevent further setState calls
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
    };
  }, []);

  const safeSetState: typeof setState = useCallback((action) => {
    if (!unmountedRef.current) setState(action);
  }, []);

  const reset = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
    safeSetState(initialState);
  }, [safeSetState]);

  function openStream(taskId: string, skill: string) {
    if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);

    const es = new EventSource(`/api/workspace-tasks/${taskId}/stream`);
    eventSourceRef.current = es;

    streamTimeoutRef.current = setTimeout(() => {
      es.close();
      eventSourceRef.current = null;
      safeSetState((s) => ({
        ...s,
        status: "failed",
        error: "Task timed out after 5 minutes",
        progressText: "",
      }));
    }, 5 * 60 * 1000);

    const clearStreamTimeout = () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
    };

    attachTaskStreamListeners(es, {
      onProgress: (message) => {
        safeSetState((s) => ({ ...s, progressText: message }));
      },
      onToolCall: (tool, id = "", args = "") => {
        const toolCall: ToolCallEvent = { tool, id, args };
        safeSetState((s) => ({
          ...s,
          toolCalls: [...s.toolCalls, toolCall],
          progressText: `Using ${tool.replace("mcp__jira__", "").replace("mcp__", "")}...`,
        }));
      },
      onResult: (data) => {
        clearStreamTimeout();
        const output = (data.output as string) ?? null;
        safeSetState((s) => ({
          ...s,
          status: "completed",
          output,
          progressText: "",
        }));
        es.close();
        eventSourceRef.current = null;
      },
      onStructuredError: (message) => {
        clearStreamTimeout();
        safeSetState((s) => ({
          ...s,
          status: "failed",
          error: message,
          progressText: "",
        }));
        es.close();
        eventSourceRef.current = null;
      },
      onNetworkError: () => {
        clearStreamTimeout();
        safeSetState((s) => ({
          ...s,
          status: "failed",
          error: "Connection lost",
          progressText: "",
        }));
        es.close();
        eventSourceRef.current = null;
      },
      onDone: () => {
        clearStreamTimeout();
        es.close();
        eventSourceRef.current = null;
      },
    });

    // Handle the "status" event (not in the shared helper since it is workspace-task-specific)
    es.addEventListener("status", (e) => {
      try {
        JSON.parse((e as MessageEvent).data);
      } catch { return; }
      safeSetState((s) => ({
        ...s,
        status: "streaming",
        progressText: `Running ${skill}...`,
      }));
    });
  }

  // On mount (or when conversationId changes), check for active tasks so the
  // UI can reconnect to a stream that was running when the user navigated away.
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    async function checkActiveTasks() {
      const rows = await workspaceTasksApi.list(conversationId!) as Array<{
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

        openStream(running.id, running.skillName);
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
  // openStream is defined inline in the component scope; including it in deps
  // would require useCallback wrapping. Since it only closes over stable refs
  // and safeSetState, the first-render version never goes stale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, safeSetState]);

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
        const task = await workspaceTasksApi.create({
          skill,
          args,
          ...(convId ? { conversationId: convId } : {}),
        });
        const taskId = task.id;

        safeSetState((s) => ({
          ...s,
          status: "streaming",
          taskId,
        }));

        openStream(taskId, skill);
      } catch (err) {
        safeSetState((s) => ({
          ...s,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    },
    // openStream only closes over stable refs/callbacks; see note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [safeSetState]
  );

  const streamExistingTask = useCallback(
    (taskId: string, skill: string) => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;

      safeSetState({
        ...initialState,
        status: "streaming",
        taskId,
        skill,
        progressText: `Running ${skill}...`,
      });

      openStream(taskId, skill);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [safeSetState]
  );

  return {
    ...state,
    submitAndStream,
    streamExistingTask,
    reset,
  };
}
