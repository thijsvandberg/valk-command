"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { attachTaskStreamListeners } from "./useStreamingTask";

export type TaskStreamStatus = "idle" | "connecting" | "streaming" | "completed" | "failed";

export interface TaskStreamState {
  status: TaskStreamStatus;
  progress: string | null;
  output: Record<string, unknown> | null;
  error: string | null;
}

export interface UseTaskStreamOptions {
  /** Timeout in ms before auto-closing. Default 5 min. Pass 0 to disable. */
  timeout?: number;
  onProgress?: (message: string) => void;
  onToolCall?: (tool: string, id?: string, args?: string) => void;
  onResult?: (data: Record<string, unknown>) => void;
  /** Called on structured SSE error (MessageEvent with JSON body). */
  onError?: (message: string) => void;
  /** Called on plain connection-level error. Falls back to onError("Connection lost") if not provided. */
  onNetworkError?: () => void;
  onDone?: () => void;
}

const IDLE_STATE: TaskStreamState = {
  status: "idle",
  progress: null,
  output: null,
  error: null,
};

const DEFAULT_TIMEOUT = 5 * 60 * 1000;

export function useTaskStream(
  taskId: string | null,
  options?: UseTaskStreamOptions,
): TaskStreamState & { close: () => void } {
  const [state, setState] = useState<TaskStreamState>(IDLE_STATE);
  const esRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Stabilise callbacks in refs so taskId-driven effect doesn't re-fire
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const safeSetState: typeof setState = useCallback((action) => {
    if (!unmountedRef.current) setState(action);
  }, []);

  const cleanup = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cleanup();
    safeSetState(IDLE_STATE);
  }, [cleanup, safeSetState]);

  useEffect(() => {
    unmountedRef.current = false;

    if (!taskId) {
      cleanup();
      safeSetState(IDLE_STATE);
      return;
    }

    // Close any previous stream before opening a new one
    cleanup();

    safeSetState({ status: "connecting", progress: null, output: null, error: null });

    const es = new EventSource(`/api/workspace-tasks/${encodeURIComponent(taskId)}/stream`);
    esRef.current = es;

    const timeoutMs = optionsRef.current?.timeout ?? DEFAULT_TIMEOUT;
    if (timeoutMs > 0) {
      timeoutRef.current = setTimeout(() => {
        es.close();
        esRef.current = null;
        safeSetState({
          status: "failed",
          progress: null,
          output: null,
          error: "Stream timed out",
        });
      }, timeoutMs);
    }

    const clearStreamTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    attachTaskStreamListeners(es, {
      onProgress: (message) => {
        safeSetState((s) => ({ ...s, status: "streaming", progress: message }));
        optionsRef.current?.onProgress?.(message);
      },
      onToolCall: (tool, id, args) => {
        safeSetState((s) => ({ ...s, status: "streaming", progress: `Using ${tool.replace("mcp__jira__", "").replace("mcp__", "")}...` }));
        optionsRef.current?.onToolCall?.(tool, id, args);
      },
      onResult: (data) => {
        clearStreamTimeout();
        es.close();
        esRef.current = null;
        safeSetState({ status: "completed", progress: null, output: data, error: null });
        optionsRef.current?.onResult?.(data);
      },
      onStructuredError: (message) => {
        clearStreamTimeout();
        es.close();
        esRef.current = null;
        safeSetState({ status: "failed", progress: null, output: null, error: message });
        optionsRef.current?.onError?.(message);
      },
      onNetworkError: () => {
        clearStreamTimeout();
        es.close();
        esRef.current = null;
        safeSetState({ status: "failed", progress: null, output: null, error: "Connection lost" });
        if (optionsRef.current?.onNetworkError) {
          optionsRef.current.onNetworkError();
        } else {
          optionsRef.current?.onError?.("Connection lost");
        }
      },
      onDone: () => {
        clearStreamTimeout();
        es.close();
        esRef.current = null;
        safeSetState((s) => ({
          ...s,
          status: s.status === "failed" ? "failed" : "completed",
          progress: null,
        }));
        optionsRef.current?.onDone?.();
      },
    });

    return () => {
      unmountedRef.current = true;
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return { ...state, close };
}

// ---------------------------------------------------------------------------
// Promise-based helper for fire-and-forget stream consumption.
// Used by TicketReview and ReviewPopover which await task completion inside
// an async function rather than using reactive hook state.
// ---------------------------------------------------------------------------

export function streamTaskAsPromise(
  taskId: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<Record<string, unknown> | void> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/workspace-tasks/${encodeURIComponent(taskId)}/stream`);

    const timeout = timeoutMs > 0
      ? setTimeout(() => { es.close(); reject(new Error("Stream timed out")); }, timeoutMs)
      : null;

    const clearT = () => { if (timeout) clearTimeout(timeout); };

    attachTaskStreamListeners(es, {
      onResult: (data) => { clearT(); es.close(); resolve(data); },
      onStructuredError: (msg) => { clearT(); es.close(); reject(new Error(msg)); },
      onNetworkError: () => { clearT(); es.close(); reject(new Error("Connection lost")); },
      onDone: () => { clearT(); es.close(); resolve(); },
    });
  });
}
