import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExportTask } from "./useExportTask";

vi.mock("@/lib/api-client", () => ({
  workspaceTasks: {
    create: vi.fn(),
    list: vi.fn(),
  },
}));

import { workspaceTasks } from "@/lib/api-client";

describe("useExportTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useExportTask());
    expect(result.current.status).toBe("idle");
    expect(result.current.isActive).toBe(false);
    expect(result.current.output).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.conversationId).toBeNull();
  });

  it("transitions to submitting then polling on successful create", async () => {
    vi.mocked(workspaceTasks.create).mockResolvedValue({
      id: "task-1",
      conversationId: "conv-1",
    } as never);
    vi.mocked(workspaceTasks.list).mockResolvedValue([
      { id: "task-1", status: "running", conversationId: "conv-1" },
    ] as never);

    const { result } = renderHook(() => useExportTask());

    await act(async () => {
      await result.current.startExport({
        sprintName: "Sprint 48",
        tickets: JSON.stringify([{ key: "VPL-1", summary: "Test" }]),
      });
    });

    expect(result.current.status).toBe("polling");
    expect(result.current.conversationId).toBe("conv-1");
    expect(result.current.isActive).toBe(true);
  });

  it("transitions to completed when poll finds completed task", async () => {
    vi.mocked(workspaceTasks.create).mockResolvedValue({
      id: "task-1",
      conversationId: "conv-1",
    } as never);

    // First poll: still running
    vi.mocked(workspaceTasks.list).mockResolvedValueOnce([
      { id: "task-1", status: "running", conversationId: "conv-1" },
    ] as never);

    const { result } = renderHook(() => useExportTask());

    await act(async () => {
      await result.current.startExport({
        sprintName: "Sprint 48",
        tickets: "[]",
      });
    });

    expect(result.current.status).toBe("polling");

    // Second poll: completed
    vi.mocked(workspaceTasks.list).mockResolvedValueOnce([
      { id: "task-1", status: "completed", output: "Here is the summary", conversationId: "conv-1" },
    ] as never);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      // Flush the pending promise from the interval callback
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe("completed");
    expect(result.current.output).toBe("Here is the summary");
    expect(result.current.isActive).toBe(false);
  });

  it("transitions to failed when poll finds failed task", async () => {
    vi.mocked(workspaceTasks.create).mockResolvedValue({
      id: "task-1",
      conversationId: "conv-1",
    } as never);
    vi.mocked(workspaceTasks.list).mockResolvedValueOnce([
      { id: "task-1", status: "running", conversationId: "conv-1" },
    ] as never);

    const { result } = renderHook(() => useExportTask());

    await act(async () => {
      await result.current.startExport({
        sprintName: "Sprint 48",
        tickets: "[]",
      });
    });

    vi.mocked(workspaceTasks.list).mockResolvedValueOnce([
      { id: "task-1", status: "failed", error: "Agent timeout", conversationId: "conv-1" },
    ] as never);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Agent timeout");
    expect(result.current.isActive).toBe(false);
  });

  it("transitions to failed when create rejects", async () => {
    vi.mocked(workspaceTasks.create).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useExportTask());

    await act(async () => {
      await result.current.startExport({
        sprintName: "Sprint 48",
        tickets: "[]",
      });
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Network error");
  });

  it("resets to idle on dismiss", async () => {
    vi.mocked(workspaceTasks.create).mockResolvedValue({
      id: "task-1",
      conversationId: "conv-1",
    } as never);
    vi.mocked(workspaceTasks.list).mockResolvedValue([
      { id: "task-1", status: "completed", output: "Done", conversationId: "conv-1" },
    ] as never);

    const { result } = renderHook(() => useExportTask());

    await act(async () => {
      await result.current.startExport({ sprintName: "Sprint 48", tickets: "[]" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.status).toBe("completed");

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.output).toBeNull();
    expect(result.current.conversationId).toBeNull();
  });
});
