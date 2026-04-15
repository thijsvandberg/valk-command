"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import useSWR from "swr";
import type { StakeholderAnalysisRow } from "@/db/schema";

export type AnalysisType = "brief" | "deep-dive";

export interface LiveStreamState {
  status: "idle" | "submitting" | "streaming" | "completed" | "failed";
  progressText: string;
  error: string | null;
}

const initialLive: LiveStreamState = { status: "idle", progressText: "", error: null };

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export function useStakeholderAnalysis(sprintId: number | null) {
  const swrKey = sprintId ? `/api/stakeholder/analysis?sprintId=${sprintId}` : null;
  const { data: rows, mutate } = useSWR<StakeholderAnalysisRow[]>(swrKey, fetcher, {
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
    setLiveState({ brief: initialLive, "deep-dive": initialLive });
    runningRowRef.current = null;
  }, [sprintId]);

  // Recover running analyses on mount / data load
  useEffect(() => {
    if (!rows) return;
    const runningRow = rows.find((r) => r.status === "running");
    if (!runningRow || !runningRow.workspaceTaskId) return;

    const type = runningRow.type;
    if (liveState[type].status !== "idle") return; // already tracking

    runningRowRef.current = runningRow;
    const taskId = runningRow.workspaceTaskId;

    // Try to re-attach to the SSE stream
    attachStream(runningRow.id, taskId, type);

    // Also poll as fallback in case SSE is already closed
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/workspace-tasks/${taskId}`);
        if (!res.ok) return;
        const task = await res.json();
        if (task.status === "completed" && task.output) {
          if (pollRef.current) clearInterval(pollRef.current);
          await completeAnalysis(runningRow.id, task.output, type);
        } else if (task.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          await failAnalysis(runningRow.id, type);
        }
      } catch {
        // ignore transient errors
      }
    }, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function setLive(type: AnalysisType, update: Partial<LiveStreamState>) {
    if (unmountedRef.current) return;
    setLiveState((prev) => ({ ...prev, [type]: { ...prev[type], ...update } }));
  }

  async function completeAnalysis(analysisId: string, output: string, type: AnalysisType) {
    await fetch(`/api/stakeholder/analysis/${analysisId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", output }),
    });
    if (!unmountedRef.current) {
      setLive(type, { status: "completed", progressText: "", error: null });
      mutate();
    }
  }

  async function failAnalysis(analysisId: string, type: AnalysisType) {
    await fetch(`/api/stakeholder/analysis/${analysisId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "failed" }),
    });
    if (!unmountedRef.current) {
      setLive(type, { status: "failed", progressText: "", error: "Task failed" });
      mutate();
    }
  }

  function attachStream(analysisId: string, taskId: string, type: AnalysisType) {
    esRef.current?.close();
    const es = new EventSource(`/api/workspace-tasks/${taskId}/stream`);
    esRef.current = es;

    setLive(type, { status: "streaming", progressText: "Generating...", error: null });

    const timeout = setTimeout(() => {
      es.close();
      failAnalysis(analysisId, type);
    }, 5 * 60 * 1000);

    es.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setLive(type, { progressText: data.message ?? "" });
      } catch { /* ignore */ }
    });

    es.addEventListener("tool_call", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        const toolName = (data.tool ?? "").replace("mcp__jira__", "").replace("mcp__", "");
        setLive(type, { progressText: `Using ${toolName}...` });
      } catch { /* ignore */ }
    });

    es.addEventListener("result", async (e) => {
      clearTimeout(timeout);
      es.close();
      esRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        const data = JSON.parse((e as MessageEvent).data);
        await completeAnalysis(analysisId, data.output ?? "", type);
      } catch {
        await failAnalysis(analysisId, type);
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

    setLive(type, { status: "submitting", progressText: "Submitting...", error: null });

    try {
      const res = await fetch("/api/stakeholder/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId, sprintName, type, sprintData, snapshotDonePoints, snapshotTodoCount }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setLive(type, { status: "failed", progressText: "", error: err?.error ?? "Failed to start" });
        return;
      }

      const { id: analysisId, taskId } = await res.json();
      mutate();
      attachStream(analysisId, taskId, type);

      // Background polling as safety net
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/workspace-tasks/${taskId}`);
          if (!r.ok) return;
          const task = await r.json();
          if (task.status === "completed" && task.output && liveState[type].status !== "completed") {
            if (pollRef.current) clearInterval(pollRef.current);
            await completeAnalysis(analysisId, task.output, type);
          } else if (task.status === "failed" && liveState[type].status !== "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            await failAnalysis(analysisId, type);
          }
        } catch { /* ignore */ }
      }, 4000);
    } catch (err) {
      setLive(type, { status: "failed", progressText: "", error: err instanceof Error ? err.message : "Unknown error" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintId]);

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
