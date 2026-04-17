"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import type { StakeholderAnalysisRow } from "@/db/schema";
import { swrFetcher, stakeholder as stakeholderApi, workspaceTasks as workspaceTasksApi, apiFetch } from "@/lib/api-client";

export type AnalysisType = "brief" | "deep-dive";

export interface LiveStreamState {
  status: "idle" | "submitting" | "streaming" | "completed" | "failed";
  progressText: string;
  error: string | null;
}

const initialLive: LiveStreamState = { status: "idle", progressText: "", error: null };

export function useStakeholderAnalysis(sprintId: number | null) {
  const swrKey = sprintId ? `/api/stakeholder/analysis?sprintId=${sprintId}` : null;
  const { data: rows, mutate } = useSWR<StakeholderAnalysisRow[]>(swrKey, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  const [liveState, setLiveState] = useState<Record<AnalysisType, LiveStreamState>>({
    brief: initialLive,
    "deep-dive": initialLive,
  });

  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);
  const runningRowRef = useRef<StakeholderAnalysisRow | null>(null);
  // Tracks current liveState so effects and callbacks can read the latest value
  // without capturing a stale closure. Updated within setLive and the sprint-reset
  // effect so it always reflects the committed state.
  const liveStateRef = useRef(liveState);

  function setLive(type: AnalysisType, update: Partial<LiveStreamState>) {
    if (unmountedRef.current) return;
    setLiveState((prev) => {
      const next = { ...prev, [type]: { ...prev[type], ...update } };
      liveStateRef.current = next;
      return next;
    });
  }

  async function completeAnalysis(analysisId: string, output: string, type: AnalysisType) {
    await apiFetch(`/api/stakeholder/analysis/${analysisId}`, {
      method: "PATCH",
      body: { status: "completed", output },
    });
    if (!unmountedRef.current) {
      setLiveRef.current(type, { status: "completed", progressText: "", error: null });
      mutate();
    }
  }

  async function failAnalysis(analysisId: string, type: AnalysisType) {
    await apiFetch(`/api/stakeholder/analysis/${analysisId}`, {
      method: "PATCH",
      body: { status: "failed" },
    });
    if (!unmountedRef.current) {
      setLiveRef.current(type, { status: "failed", progressText: "", error: "Task failed" });
      mutate();
    }
  }

  function attachStream(analysisId: string, taskId: string, type: AnalysisType) {
    esRef.current?.close();
    const es = new EventSource(`/api/workspace-tasks/${taskId}/stream`);
    esRef.current = es;

    setLiveRef.current(type, { status: "streaming", progressText: "Generating...", error: null });

    const timeout = setTimeout(() => {
      es.close();
      failAnalysisRef.current(analysisId, type);
    }, 5 * 60 * 1000);

    es.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setLiveRef.current(type, { progressText: data.message ?? "" });
      } catch { /* ignore */ }
    });

    es.addEventListener("tool_call", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        const toolName = (data.tool ?? "").replace("mcp__jira__", "").replace("mcp__", "");
        setLiveRef.current(type, { progressText: `Using ${toolName}...` });
      } catch { /* ignore */ }
    });

    es.addEventListener("result", async (e) => {
      clearTimeout(timeout);
      es.close();
      esRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        const data = JSON.parse((e as MessageEvent).data);
        await completeAnalysisRef.current(analysisId, data.output ?? "", type);
      } catch {
        await failAnalysisRef.current(analysisId, type);
      }
    });

    es.addEventListener("error", async () => {
      clearTimeout(timeout);
      es.close();
      esRef.current = null;
      // Don't fail immediately: the polling interval will detect completion
    });

    es.addEventListener("done", () => {
      clearTimeout(timeout);
      es.close();
      esRef.current = null;
    });
  }

  // Function refs initialized once — these functions only close over refs and
  // stable state setters so the first-render version never goes stale.
  const setLiveRef = useRef(setLive);
  const completeAnalysisRef = useRef(completeAnalysis);
  const failAnalysisRef = useRef(failAnalysis);
  const attachStreamRef = useRef(attachStream);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      esRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Reset live state when sprint changes
  useEffect(() => {
    esRef.current?.close();
    esRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    const resetState = { brief: initialLive, "deep-dive": initialLive };
    liveStateRef.current = resetState;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveState(resetState);
    runningRowRef.current = null;
  }, [sprintId]);

  // Recover running analyses on mount / data load
  useEffect(() => {
    if (!rows) return;
    const runningRow = rows.find((r) => r.status === "running");
    if (!runningRow || !runningRow.workspaceTaskId) return;

    const type = runningRow.type;
    // Read current liveState via ref to avoid adding liveState as a dep, which
    // would cause the effect to re-run on every state update and bypass the guard.
    if (liveStateRef.current[type].status !== "idle") return;

    runningRowRef.current = runningRow;
    const taskId = runningRow.workspaceTaskId;

    // Try to re-attach to the SSE stream
    attachStreamRef.current(runningRow.id, taskId, type);

    // Also poll as fallback in case SSE is already closed
    pollRef.current = setInterval(async () => {
      try {
        const task = await workspaceTasksApi.get(taskId) as Record<string, unknown>;
        if (task.status === "completed" && task.output) {
          if (pollRef.current) clearInterval(pollRef.current);
          await completeAnalysisRef.current(runningRow.id, task.output as string, type);
        } else if (task.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          await failAnalysisRef.current(runningRow.id, type);
        }
      } catch {
        // ignore transient errors
      }
    }, 4000);
  }, [rows]);

  const generate = useCallback(async (
    type: AnalysisType,
    sprintName: string,
    sprintData: string,
    snapshotDonePoints: number,
    snapshotTodoCount: number,
  ) => {
    if (!sprintId) return;

    // Cancel any running stream
    esRef.current?.close();
    esRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);

    setLiveRef.current(type, { status: "submitting", progressText: "Submitting...", error: null });

    try {
      const result = await stakeholderApi.createAnalysis({
        sprintId, sprintName, type, sprintData, snapshotDonePoints, snapshotTodoCount,
      }) as { id: string; taskId: string };
      const { id: analysisId, taskId } = result;
      mutate();
      attachStreamRef.current(analysisId, taskId, type);

      // Background polling as safety net
      pollRef.current = setInterval(async () => {
        try {
          const task = await workspaceTasksApi.get(taskId) as Record<string, unknown>;
          if (task.status === "completed" && task.output && liveStateRef.current[type].status !== "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            await completeAnalysisRef.current(analysisId, task.output as string, type);
          } else if (task.status === "failed" && liveStateRef.current[type].status !== "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            await failAnalysisRef.current(analysisId, type);
          }
        } catch { /* ignore */ }
      }, 4000);
    } catch (err) {
      setLiveRef.current(type, { status: "failed", progressText: "", error: err instanceof Error ? err.message : "Unknown error" });
    }
  }, [sprintId, mutate]);

  // Derive latest of each type from stored rows
  const latestByType = (type: AnalysisType) =>
    rows?.filter((r) => r.type === type).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

  const brief = latestByType("brief");
  const deepDive = latestByType("deep-dive");

  function isStale(row: StakeholderAnalysisRow | null, currentDonePoints: number, currentTodoCount: number): boolean {
    if (!row || row.status !== "completed") return false;
    return row.snapshotDonePoints !== currentDonePoints || row.snapshotTodoCount !== currentTodoCount;
  }

  return {
    brief,
    deepDive,
    liveState,
    generate,
    isStale,
    mutate,
  };
}
