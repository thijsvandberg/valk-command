"use client";

import { useCallback, useRef, useEffect } from "react";
import type { StoryWriterStatus } from "@/types/story-writer";
import type { RelatedStoryCandidateRow } from "@/db/schema";
import { apiFetch, ApiError } from "@/lib/api-client";
import { attachTaskStreamListeners } from "./useStreamingTask";

export interface WorkspaceUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface TaskMonitoringOptions {
  apiBase: string;
  ticketKey?: string;
  unmountedRef: React.RefObject<boolean>;
  onStatus: (s: StoryWriterStatus) => void;
  onProgress: (s: string) => void;
  onError: (s: string | null) => void;
  onUsage: (u: WorkspaceUsage) => void;
  onDuration: (d: number) => void;
  onRelatedCandidates: (c: RelatedStoryCandidateRow[]) => void;
  refreshSession: () => Promise<void>;
}

function extractUsage(data: Record<string, unknown>): WorkspaceUsage {
  const usageRecord = (data.usage ?? {}) as Record<string, unknown>;
  const inputTokens = (data.inputTokens ?? usageRecord.inputTokens ?? data.input_tokens ?? usageRecord.input_tokens ?? 0) as number;
  const outputTokens = (data.outputTokens ?? usageRecord.outputTokens ?? data.output_tokens ?? usageRecord.output_tokens ?? 0) as number;
  const cost = (data.cost ?? usageRecord.cost ?? 0) as number;
  return { inputTokens, outputTokens, cost };
}

function notifyStoryWriterFailure(ticketKey: string | undefined, message: string) {
  if (!ticketKey) return;
  apiFetch("/api/notifications", {
    method: "POST",
    body: {
      type: "story-writer",
      message,
      category: "story-writer",
      jiraKey: ticketKey,
    },
  }).catch(() => { /* fire-and-forget, non-critical */ });
}

export function useTaskMonitoring(options: TaskMonitoringOptions) {
  const {
    apiBase, ticketKey, unmountedRef,
    onStatus, onProgress, onError, onUsage, onDuration, onRelatedCandidates,
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendStartRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const refreshSessionRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { refreshSessionRef.current = options.refreshSession; }, [options.refreshSession]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const startMonitoring = useCallback((taskId: string, progressMessage = "Starting...") => {
    const streamUrl = `/api/workspace-tasks/${taskId}/stream`;

    cancelledRef.current = false;
    onStatus("streaming");
    onProgress(progressMessage);

    const resultHandled = { current: false };

    const applyResult = async (output: string) => {
      if (resultHandled.current || unmountedRef.current || cancelledRef.current) return;
      resultHandled.current = true;

      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      const t0 = performance.now();
      const hasRelatedTags = output.includes("<related-stories") || output.includes("<link-suggestion");

      const applyDraftPromise = (async () => {
        let applied = false;
        for (let attempt = 0; attempt < 2 && !applied; attempt++) {
          try {
            await apiFetch(`${apiBase}/apply-draft`, {
              method: "POST",
              body: { output, taskId, assistantContent: output },
            });
            applied = true;
          } catch { /* retry */ }
        }
        if (!applied && !unmountedRef.current) {
          onError("Draft received but could not be saved");
        }
      })();

      const applyRelatedPromise = hasRelatedTags
        ? (async () => {
            try {
              const relatedData = await apiFetch<{ candidates?: RelatedStoryCandidateRow[] }>(`${apiBase}/apply-related`, {
                method: "POST",
                body: { output, taskId },
              });
              if (!unmountedRef.current && relatedData.candidates?.length) {
                onRelatedCandidates(relatedData.candidates);
              }
            } catch { /* non-critical */ }
          })()
        : Promise.resolve();

      const refreshPromise = refreshSessionRef.current();

      await Promise.all([applyDraftPromise, applyRelatedPromise, refreshPromise]);

      const elapsed = Math.round(performance.now() - t0);
      console.debug(`[task-monitoring] applyResult post-processing: ${elapsed}ms (related-tags: ${hasRelatedTags})`);

      if (!unmountedRef.current) {
        if (sendStartRef.current) {
          onDuration(Date.now() - sendStartRef.current);
          sendStartRef.current = null;
        }
        onStatus("ready");
        onProgress("");
      }
    };

    const POLL_DELAY_MS = 2_000;
    const POLL_INTERVAL_MS = 3_000;
    const MAX_POLL_MS = 300_000;
    const pollStart = Date.now();

    const pollTask = async () => {
      if (resultHandled.current || unmountedRef.current) return;
      if (Date.now() - pollStart > MAX_POLL_MS) {
        if (!resultHandled.current && !unmountedRef.current) {
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          onError("Request timed out");
          onStatus("ready");
          onProgress("");
          notifyStoryWriterFailure(ticketKey, `Story writer timed out for ${ticketKey}`);
        }
        return;
      }

      try {
        const task = await apiFetch<Record<string, unknown>>(`/api/workspace-tasks/${taskId}`);
        if (task.status === "completed" && task.output) {
          const usage = extractUsage(task);
          if (!unmountedRef.current) onUsage(usage);
          await applyResult(task.output as string);
        } else if (task.status === "failed") {
          if (!resultHandled.current && !unmountedRef.current) {
            resultHandled.current = true;
            onError((task.error as string) ?? "Task failed on workspace");
            onStatus("ready");
            onProgress("");
            notifyStoryWriterFailure(ticketKey, `Story writer failed for ${ticketKey}`);
          }
        } else {
          if (!unmountedRef.current) {
            const elapsed = Math.round((Date.now() - pollStart) / 1000);
            onProgress(`Processing on workspace... (${elapsed}s)`);
          }
          pollTimerRef.current = setTimeout(pollTask, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          if (!resultHandled.current && !unmountedRef.current) {
            resultHandled.current = true;
            onStatus("ready");
            onProgress("");
          }
          return;
        }
        if (err instanceof ApiError) {
          if (!unmountedRef.current) onProgress("Waiting for workspace...");
          pollTimerRef.current = setTimeout(pollTask, POLL_INTERVAL_MS);
          return;
        }
        if (!unmountedRef.current) {
          const elapsed = Math.round((Date.now() - pollStart) / 1000);
          onProgress(`Reconnecting... (${elapsed}s)`);
        }
        pollTimerRef.current = setTimeout(pollTask, POLL_INTERVAL_MS);
      }
    };

    pollTimerRef.current = setTimeout(pollTask, POLL_DELAY_MS);

    eventSourceRef.current?.close();
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    attachTaskStreamListeners(es, {
      onProgress: (message) => {
        if (!unmountedRef.current) onProgress(message);
      },
      onToolCall: (tool) => {
        const name = tool.replace(/^mcp__jira__/, "").replace(/^mcp__/, "").replace(/_/g, " ");
        if (!unmountedRef.current) onProgress(`Using ${name}...`);
      },
      onResult: async (data) => {
        const usage = extractUsage(data);
        const output = data.output as string;
        if (!unmountedRef.current) onUsage(usage);
        if (output) await applyResult(output);
      },
      onStructuredError: (message) => {
        es.close();
        eventSourceRef.current = null;
        if (!resultHandled.current && !unmountedRef.current) onError(message);
      },
      onNetworkError: () => {
        es.close();
        eventSourceRef.current = null;
        if (!resultHandled.current) {
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
          pollTimerRef.current = setTimeout(pollTask, 1_000);
        }
      },
      onDone: () => {
        es.close();
        eventSourceRef.current = null;
      },
    });
  }, [apiBase, ticketKey, unmountedRef, onStatus, onProgress, onError, onUsage, onDuration, onRelatedCandidates]);

  const cancelTask = useCallback((_taskId: string) => {
    // Prevent any in-flight poll/SSE result from being applied
    cancelledRef.current = true;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    sendStartRef.current = null;
  }, []);

  return { startMonitoring, sendStartRef, pollTimerRef, cancelTask };
}
