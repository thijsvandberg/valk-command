"use client";

// Shared SSE event listener attachment for workspace task streams.
// Extracted to avoid reimplementing the same 5-event pattern in every hook that
// monitors a workspace task. Each consumer keeps its own EventSource instance
// (since they open it at different times / with different lifecycle semantics)
// and passes it here along with typed callbacks.

export interface StreamHandlers {
  onProgress?: (message: string) => void;
  onToolCall?: (tool: string, id?: string, args?: string) => void;
  /** Called when the SSE stream delivers a structured result payload. */
  onResult?: (data: Record<string, unknown>) => void;
  /** Called when the SSE stream delivers a structured error (MessageEvent with JSON body). */
  onStructuredError?: (message: string) => void;
  /**
   * Called when the EventSource fires a plain connection-level error (not a
   * MessageEvent). Useful for triggering a polling fallback.
   */
  onNetworkError?: () => void;
  onDone?: () => void;
}

/**
 * Attaches the standard set of workspace-task SSE listeners to an existing
 * EventSource. Returns nothing; the caller is responsible for closing the
 * EventSource when done.
 */
export function attachTaskStreamListeners(
  es: EventSource,
  handlers: StreamHandlers,
): void {
  es.addEventListener("progress", (e) => {
    let data: { message: string };
    try { data = JSON.parse((e as MessageEvent).data); } catch { return; }
    handlers.onProgress?.(data.message);
  });

  es.addEventListener("tool_call", (e) => {
    let data: { tool: string; id?: string; args?: string };
    try { data = JSON.parse((e as MessageEvent).data); } catch { return; }
    handlers.onToolCall?.(data.tool, data.id, data.args);
  });

  es.addEventListener("result", (e) => {
    let data: Record<string, unknown>;
    try { data = JSON.parse((e as MessageEvent).data); } catch { return; }
    handlers.onResult?.(data);
  });

  es.addEventListener("error", (e) => {
    if (e instanceof MessageEvent) {
      let data: { message: string };
      try { data = JSON.parse(e.data); } catch {
        handlers.onStructuredError?.("Unknown error");
        return;
      }
      handlers.onStructuredError?.(data.message);
    } else {
      handlers.onNetworkError?.();
    }
  });

  es.addEventListener("done", () => {
    handlers.onDone?.();
  });
}
