import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWorkspaceTask } from "./useWorkspaceTask";

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

  removeEventListener(type: string, listener: Listener) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data?: string) {
    const handlers = this.listeners[type] ?? [];
    if (data !== undefined) {
      const event = new MessageEvent(type, { data });
      handlers.forEach((h) => h(event));
    } else {
      const event = new Event(type);
      handlers.forEach((h) => h(event));
    }
  }

  static instances: MockEventSource[] = [];
  static clear() {
    MockEventSource.instances = [];
  }
  static latest(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  MockEventSource.clear();
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWorkspaceTask", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => useWorkspaceTask());

    expect(result.current.status).toBe("idle");
    expect(result.current.taskId).toBeNull();
    expect(result.current.skill).toBeNull();
    expect(result.current.toolCalls).toEqual([]);
    expect(result.current.progressText).toBe("");
    expect(result.current.output).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transitions to submitting then streaming on successful submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-1" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      result.current.submitAndStream("review", { key: "VPL-1" });
      // Capture submitting state synchronously after the microtask
      await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => expect(result.current.status).toBe("streaming"));
    expect(result.current.taskId).toBe("task-1");
    expect(result.current.skill).toBe("review");
    expect(fetch).toHaveBeenCalledWith("/api/workspace-tasks", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "review", args: { key: "VPL-1" } }),
    }));
  });

  it("includes conversationId when provided", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-2" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", { key: "VPL-1" }, "conv-1");
    });

    expect(fetch).toHaveBeenCalledWith("/api/workspace-tasks", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill: "review", args: { key: "VPL-1" }, conversationId: "conv-1" }),
    }));
  });

  it("transitions to failed when submit returns non-ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "Invalid skill" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("bad-skill", {});
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Invalid skill");
  });

  it("uses status code fallback when error body parse fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("not json"); },
    } as unknown as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Request failed (500)");
  });

  it("transitions to failed when fetch throws", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Network failure");
  });

  it("handles progress SSE events", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-3" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();
    expect(es.url).toBe("/api/workspace-tasks/task-3/stream");

    await act(async () => {
      es.emit("progress", JSON.stringify({ message: "Analyzing code..." }));
    });

    expect(result.current.progressText).toBe("Analyzing code...");
  });

  it("handles tool_call SSE events", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-4" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    await act(async () => {
      es.emit("tool_call", JSON.stringify({
        tool: "mcp__jira__get_issue",
        id: "tc-1",
        args: '{"key":"VPL-1"}',
      }));
    });

    expect(result.current.toolCalls).toHaveLength(1);
    expect(result.current.toolCalls[0].tool).toBe("mcp__jira__get_issue");
    expect(result.current.progressText).toBe("Using get_issue...");
  });

  it("handles result SSE event and transitions to completed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-5" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    await act(async () => {
      es.emit("result", JSON.stringify({ output: "Review complete!", status: "completed" }));
    });

    expect(result.current.status).toBe("completed");
    expect(result.current.output).toBe("Review complete!");
    expect(result.current.progressText).toBe("");
    expect(es.closed).toBe(true);
  });

  it("handles error SSE event with parsed message", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-6" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    await act(async () => {
      es.emit("error", JSON.stringify({ message: "Agent timeout" }));
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Agent timeout");
    expect(es.closed).toBe(true);
  });

  it("handles error SSE event with unparseable data", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-7" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    await act(async () => {
      es.emit("error", "not-json");
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Unknown error");
    expect(es.closed).toBe(true);
  });

  it("handles connection-level error event (not MessageEvent)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-8" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    // Emit a plain Event (not MessageEvent) to simulate a connection error
    await act(async () => {
      const handlers = es.listeners["error"] ?? [];
      const plainEvent = new Event("error");
      handlers.forEach((h) => h(plainEvent));
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Connection lost");
    expect(es.closed).toBe(true);
  });

  it("handles done SSE event by closing the stream", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-9" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    await act(async () => {
      es.emit("done");
    });

    expect(es.closed).toBe(true);
    // Status remains streaming since done does not explicitly set completed
    expect(result.current.status).toBe("streaming");
  });

  it("resets state to idle", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-10" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    expect(result.current.status).toBe("streaming");

    const es = MockEventSource.latest();

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.taskId).toBeNull();
    expect(result.current.skill).toBeNull();
    expect(result.current.toolCalls).toEqual([]);
    expect(result.current.output).toBeNull();
    expect(result.current.error).toBeNull();
    expect(es.closed).toBe(true);
  });

  it("closes previous stream when submitting again", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-11" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "task-12" }),
      } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const firstEs = MockEventSource.latest();

    await act(async () => {
      await result.current.submitAndStream("test", {});
    });

    expect(firstEs.closed).toBe(true);
    expect(result.current.taskId).toBe("task-12");
    expect(result.current.skill).toBe("test");
  });

  it("handles status SSE event", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-13" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    await act(async () => {
      es.emit("status", JSON.stringify({ status: "running" }));
    });

    expect(result.current.status).toBe("streaming");
    expect(result.current.progressText).toBe("Running review...");
  });

  it("ignores SSE events with invalid JSON", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-14" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    // Send invalid JSON to each event type; none should crash
    await act(async () => {
      es.emit("status", "{broken");
      es.emit("progress", "{broken");
      es.emit("tool_call", "{broken");
      es.emit("result", "{broken");
    });

    // State should still be streaming, unaffected by bad events
    expect(result.current.status).toBe("streaming");
    expect(result.current.progressText).toBe("");
    expect(result.current.toolCalls).toEqual([]);
    expect(result.current.output).toBeNull();
  });

  it("strips mcp prefixes from tool names in progress text", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "task-15" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceTask());

    await act(async () => {
      await result.current.submitAndStream("review", {});
    });

    const es = MockEventSource.latest();

    await act(async () => {
      es.emit("tool_call", JSON.stringify({
        tool: "mcp__some_tool",
        id: "tc-2",
        args: "{}",
      }));
    });

    expect(result.current.progressText).toBe("Using some_tool...");
  });
});
