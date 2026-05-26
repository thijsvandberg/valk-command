import { useState, useCallback, useRef, useEffect } from "react";
import { workspaceTasks } from "@/lib/api-client";

export type ExportStatus = "idle" | "submitting" | "polling" | "completed" | "failed";

interface ExportState {
  status: ExportStatus;
  output: string | null;
  error: string | null;
  conversationId: string | null;
}

interface StartExportArgs {
  sprintName: string;
  tickets: string;
}

const POLL_INTERVAL_MS = 3_000;

export function useExportTask() {
  const [state, setState] = useState<ExportState>({
    status: "idle",
    output: null,
    error: null,
    conversationId: null,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startExport = useCallback(async (args: StartExportArgs) => {
    cleanup();

    setState({
      status: "submitting",
      output: null,
      error: null,
      conversationId: null,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await workspaceTasks.create(
        {
          skillName: "export-stakeholder-summary",
          args: {
            sprintName: args.sprintName,
            tickets: args.tickets,
          },
        },
        controller.signal,
      );

      const data = result as Record<string, unknown>;
      const conversationId = typeof data.conversationId === "string" ? data.conversationId : null;

      if (!conversationId) {
        setState((s) => ({ ...s, status: "failed", error: "No conversation returned" }));
        return;
      }

      setState((s) => ({ ...s, status: "polling", conversationId }));

      pollRef.current = setInterval(async () => {
        try {
          const tasks = await workspaceTasks.list(conversationId);
          if (!Array.isArray(tasks) || tasks.length === 0) return;

          const task = tasks[0] as Record<string, unknown>;
          if (task.status === "completed" && typeof task.output === "string") {
            cleanup();
            setState((s) => ({ ...s, status: "completed", output: task.output as string }));
          } else if (task.status === "failed") {
            cleanup();
            const errorMsg = typeof task.error === "string" ? task.error : "Export failed";
            setState((s) => ({ ...s, status: "failed", error: errorMsg }));
          }
        } catch {
          // Silently ignore individual poll errors
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      cleanup();
      const msg = err instanceof Error ? err.message : "Could not start export. Is the workspace running?";
      setState((s) => ({ ...s, status: "failed", error: msg }));
    }
  }, [cleanup]);

  const dismiss = useCallback(() => {
    cleanup();
    setState({ status: "idle", output: null, error: null, conversationId: null });
  }, [cleanup]);

  return {
    ...state,
    isActive: state.status === "submitting" || state.status === "polling",
    startExport,
    dismiss,
  };
}
