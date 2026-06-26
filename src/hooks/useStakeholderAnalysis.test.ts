import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
  stakeholder: {
    createAnalysis: vi.fn().mockResolvedValue({ id: "a1", taskId: "t1" }),
  },
  workspaceTasks: {
    get: vi.fn().mockResolvedValue({ status: "running" }),
  },
  apiFetch: vi.fn().mockResolvedValue({}),
}));

vi.mock("./useStreamingTask", () => ({
  attachTaskStreamListeners: vi.fn(),
}));

import { useStakeholderAnalysis, type AnalysisType } from "./useStakeholderAnalysis";
import { stakeholder as stakeholderApi, workspaceTasks as workspaceTasksApi, swrFetcher, apiFetch } from "@/lib/api-client";
import { attachTaskStreamListeners } from "./useStreamingTask";

type Listener = (event: MessageEvent | Event) => void;

class MockEventSource {
  url: string;
  listeners: Record<string, Listener[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  close() {
    this.closed = true;
  }

  static instances: MockEventSource[] = [];
  static clear() { MockEventSource.instances = []; }
  static latest(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe("useStakeholderAnalysis", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    MockEventSource.clear();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null rows when sprintId is null", () => {
    const { result } = renderHook(() => useStakeholderAnalysis(null), { wrapper });
    expect(result.current.brief).toBeNull();
    expect(result.current.deepDive).toBeNull();
  });

  it("initial liveState is idle for both types", () => {
    const { result } = renderHook(() => useStakeholderAnalysis(100), { wrapper });
    expect(result.current.liveState.brief.status).toBe("idle");
    expect(result.current.liveState["deep-dive"].status).toBe("idle");
  });

  it("resets live state on sprint change", () => {
    const { result, rerender } = renderHook(
      ({ sprintId }) => useStakeholderAnalysis(sprintId),
      { initialProps: { sprintId: 100 as number | null }, wrapper },
    );

    // Change sprint
    rerender({ sprintId: 200 });

    expect(result.current.liveState.brief.status).toBe("idle");
    expect(result.current.liveState["deep-dive"].status).toBe("idle");
  });

  it("generate creates analysis and attaches stream", async () => {
    vi.mocked(stakeholderApi.createAnalysis).mockResolvedValue({ id: "a1", taskId: "t1" });

    const { result } = renderHook(() => useStakeholderAnalysis(100), { wrapper });

    await act(async () => {
      await result.current.generate("brief", "Sprint 1", "{}", 10, 5);
    });

    expect(stakeholderApi.createAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ sprintId: 100, type: "brief" }),
    );
    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(1);
    expect(attachTaskStreamListeners).toHaveBeenCalled();
  });

  it("detects stale analysis (changed point/todo counts)", () => {
    const { result } = renderHook(() => useStakeholderAnalysis(100), { wrapper });

    const row = {
      id: "a1",
      sprintId: 100,
      type: "brief" as const,
      status: "completed",
      snapshotDonePoints: 10,
      snapshotTodoCount: 5,
      createdAt: new Date().toISOString(),
    };

    // Same counts should not be stale
    expect(result.current.isStale(row as never, 10, 5)).toBe(false);

    // Different counts should be stale
    expect(result.current.isStale(row as never, 15, 5)).toBe(true);
    expect(result.current.isStale(row as never, 10, 8)).toBe(true);
  });

  it("isStale returns false for non-completed rows", () => {
    const { result } = renderHook(() => useStakeholderAnalysis(100), { wrapper });
    const row = { status: "running", snapshotDonePoints: 10, snapshotTodoCount: 5 };
    expect(result.current.isStale(row as never, 20, 10)).toBe(false);
  });

  it("isStale returns false for null row", () => {
    const { result } = renderHook(() => useStakeholderAnalysis(100), { wrapper });
    expect(result.current.isStale(null, 10, 5)).toBe(false);
  });

  it("generate does nothing when sprintId is null", async () => {
    const { result } = renderHook(() => useStakeholderAnalysis(null), { wrapper });

    await act(async () => {
      await result.current.generate("brief", "Sprint 1", "{}", 10, 5);
    });

    expect(stakeholderApi.createAnalysis).not.toHaveBeenCalled();
  });

  it("recover-effect runs a single fallback poll and clears it on unmount", async () => {
    // Real timers so the async SWR fetch + recover-effect settle via waitFor; we
    // only need the 4s interval to be CREATED and CLEARED, never to fire.
    vi.useRealTimers();

    const runningRow = {
      id: "a1",
      sprintId: 100,
      type: "brief" as const,
      status: "running",
      workspaceTaskId: "t1",
      snapshotDonePoints: 0,
      snapshotTodoCount: 0,
      output: null,
      createdAt: new Date(0).toISOString(),
    };
    vi.mocked(swrFetcher).mockResolvedValue([runningRow]);

    const setIntervalSpy = vi.spyOn(global, "setInterval");
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    const { unmount } = renderHook(() => useStakeholderAnalysis(100), { wrapper });

    // Wait until the recover-effect has engaged its 4s fallback poll.
    await waitFor(() =>
      expect(setIntervalSpy.mock.calls.filter((c) => c[1] === 4000).length).toBe(1),
    );

    const pollIdx = setIntervalSpy.mock.calls.findIndex((c) => c[1] === 4000);
    const pollId = setIntervalSpy.mock.results[pollIdx].value;

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledWith(pollId);
  });

  it("generate handles API errors gracefully", async () => {
    vi.mocked(stakeholderApi.createAnalysis).mockRejectedValue(new Error("API fail"));

    const { result } = renderHook(() => useStakeholderAnalysis(100), { wrapper });

    await act(async () => {
      await result.current.generate("brief", "Sprint 1", "{}", 10, 5);
    });

    expect(result.current.liveState.brief.status).toBe("failed");
    expect(result.current.liveState.brief.error).toContain("API fail");
  });
});
