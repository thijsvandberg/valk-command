import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTaskMonitoring } from "./useTaskMonitoring";

type ESListener = (event: MessageEvent | Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  readyState = 0;
  private listeners: Record<string, ESListener[]> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: ESListener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: ESListener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  close() {
    this.readyState = 2;
  }

  emit(type: string, data?: unknown) {
    const handlers = this.listeners[type] ?? [];
    if (type === "error" && data === undefined) {
      handlers.forEach((h) => h(new Event("error")));
    } else {
      const event = new MessageEvent(type, {
        data: typeof data === "string" ? data : JSON.stringify(data),
      });
      handlers.forEach((h) => h(event));
    }
  }
}

const API_BASE = "/api/tickets/BRDG-100/story-writer";

function createOptions(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    apiBase: API_BASE,
    unmountedRef: { current: false },
    onStatus: vi.fn(),
    onProgress: vi.fn(),
    onError: vi.fn(),
    onUsage: vi.fn(),
    onDuration: vi.fn(),
    onRelatedCandidates: vi.fn(),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  MockEventSource.instances = [];
  (globalThis as Record<string, unknown>).EventSource = MockEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).EventSource;
});

describe("useTaskMonitoring", () => {
  describe("startMonitoring", () => {
    it("sets status to streaming and opens an EventSource", () => {
      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      expect(opts.onStatus).toHaveBeenCalledWith("streaming");
      expect(opts.onProgress).toHaveBeenCalledWith("Starting...");
      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe("/api/workspace-tasks/task-1/stream");
    });

    it("accepts a custom progress message", () => {
      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1", "Resuming...");
      });

      expect(opts.onProgress).toHaveBeenCalledWith("Resuming...");
    });

    it("forwards SSE progress events to onProgress", () => {
      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      const es = MockEventSource.instances[0];

      act(() => {
        es.emit("progress", { message: "Analyzing ticket..." });
      });

      expect(opts.onProgress).toHaveBeenCalledWith("Analyzing ticket...");
    });

    it("forwards SSE tool_call events as formatted progress", () => {
      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      const es = MockEventSource.instances[0];

      act(() => {
        es.emit("tool_call", { tool: "mcp__jira__get_issue" });
      });

      expect(opts.onProgress).toHaveBeenCalledWith("Using get issue...");
    });

    it("handles SSE result event and calls apply-draft", async () => {
      const fetchSpy = vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [] }) } as Response);

      const refreshSession = vi.fn().mockResolvedValue(undefined);
      const opts = createOptions({ refreshSession });
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      const es = MockEventSource.instances[0];

      await act(async () => {
        es.emit("result", {
          output: "Draft content here",
          inputTokens: 100,
          outputTokens: 200,
          cost: 0.05,
        });
      });

      expect(opts.onUsage).toHaveBeenCalledWith({
        inputTokens: 100,
        outputTokens: 200,
        cost: 0.05,
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/apply-draft`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ output: "Draft content here", taskId: "task-1", assistantContent: "Draft content here" }),
        }),
      );
    });

    it("closes EventSource on done event", () => {
      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      const es = MockEventSource.instances[0];

      act(() => {
        es.emit("done");
      });

      expect(es.readyState).toBe(2);
    });
  });

  describe("poll fallback", () => {
    it("polls task endpoint when SSE error occurs", async () => {
      vi.useFakeTimers();

      const fetchSpy = vi.spyOn(global, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: "completed",
            output: "Polled output",
            inputTokens: 50,
            outputTokens: 100,
            cost: 0.01,
          }),
        } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [] }) } as Response);

      const refreshSession = vi.fn().mockResolvedValue(undefined);
      const opts = createOptions({ refreshSession });
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      const es = MockEventSource.instances[0];

      act(() => {
        es.emit("error");
      });

      await act(async () => {
        vi.advanceTimersByTime(1_000);
      });

      expect(fetchSpy).toHaveBeenCalledWith("/api/workspace-tasks/task-1");

      vi.useRealTimers();
    });

    it("schedules poll with initial delay on startMonitoring", async () => {
      vi.useFakeTimers();

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "running",
        }),
      } as Response);

      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      expect(fetch).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });

      expect(fetch).toHaveBeenCalledWith("/api/workspace-tasks/task-1");

      vi.useRealTimers();
    });

    it("reports error when polled task has failed status", async () => {
      vi.useFakeTimers();

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "failed",
          error: "Workspace error",
        }),
      } as Response);

      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });

      expect(opts.onError).toHaveBeenCalledWith("Workspace error");
      expect(opts.onStatus).toHaveBeenCalledWith("ready");

      vi.useRealTimers();
    });

    it("prevents double-apply when SSE result and poll complete near-simultaneously", async () => {
      vi.useFakeTimers();

      const applyDraftCalls: string[] = [];
      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/apply-draft")) {
          applyDraftCalls.push(urlStr);
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (urlStr.includes("/apply-related")) {
          return { ok: true, json: async () => ({ candidates: [] }) } as Response;
        }
        if (urlStr.includes("/api/workspace-tasks/task-1")) {
          return {
            ok: true,
            json: async () => ({
              status: "completed",
              output: "Polled output",
              inputTokens: 10,
              outputTokens: 20,
              cost: 0.001,
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      });

      const refreshSession = vi.fn().mockResolvedValue(undefined);
      const opts = createOptions({ refreshSession });
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      const es = MockEventSource.instances[0];

      // SSE result arrives first
      await act(async () => {
        es.emit("result", {
          output: "SSE output",
          inputTokens: 100,
          outputTokens: 200,
          cost: 0.05,
        });
      });

      // Poll fires after SSE already handled the result
      await act(async () => {
        vi.advanceTimersByTime(2_000);
      });

      // apply-draft should only have been called once (from the SSE result)
      expect(applyDraftCalls).toHaveLength(1);

      vi.useRealTimers();
      fetchSpy.mockRestore();
    });

    it("closes EventSource on 5-minute poll timeout", async () => {
      vi.useFakeTimers();

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ status: "running" }),
      } as Response);

      const opts = createOptions();
      const { result } = renderHook(() => useTaskMonitoring(opts));

      act(() => {
        result.current.startMonitoring("task-1");
      });

      const es = MockEventSource.instances[0];
      expect(es.readyState).not.toBe(2);

      // Advance past the 5-minute timeout (300s + buffer for poll intervals)
      for (let i = 0; i < 110; i++) {
        await act(async () => {
          vi.advanceTimersByTime(3_000);
        });
      }

      expect(es.readyState).toBe(2);
      expect(opts.onError).toHaveBeenCalledWith("Request timed out");

      vi.useRealTimers();
    });
  });
});
