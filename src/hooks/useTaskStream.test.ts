import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTaskStream, streamTaskAsPromise } from "./useTaskStream";

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
      handlers.forEach((h) => h(new MessageEvent(type, { data })));
    } else {
      handlers.forEach((h) => h(new Event(type)));
    }
  }

  emitPlainError() {
    const handlers = this.listeners["error"] ?? [];
    handlers.forEach((h) => h(new Event("error")));
  }

  static instances: MockEventSource[] = [];
  static clear() { MockEventSource.instances = []; }
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

// ---------------------------------------------------------------------------
// useTaskStream hook
// ---------------------------------------------------------------------------

describe("useTaskStream", () => {
  it("returns idle when taskId is null", () => {
    const { result } = renderHook(() => useTaskStream(null));

    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBeNull();
    expect(result.current.output).toBeNull();
    expect(result.current.error).toBeNull();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("opens EventSource and transitions to connecting when taskId is set", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));

    expect(result.current.status).toBe("connecting");
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.latest().url).toBe("/api/workspace-tasks/task-1/stream");
  });

  it("transitions to streaming on progress event", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("progress", JSON.stringify({ message: "Analyzing..." }));
    });

    expect(result.current.status).toBe("streaming");
    expect(result.current.progress).toBe("Analyzing...");
  });

  it("transitions to streaming on tool_call event with cleaned name", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("tool_call", JSON.stringify({ tool: "mcp__jira__get_issue", id: "tc-1" }));
    });

    expect(result.current.status).toBe("streaming");
    expect(result.current.progress).toBe("Using get_issue...");
  });

  it("transitions to completed on result event and closes stream", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("result", JSON.stringify({ output: "Done", status: "completed" }));
    });

    expect(result.current.status).toBe("completed");
    expect(result.current.output).toEqual({ output: "Done", status: "completed" });
    expect(result.current.progress).toBeNull();
    expect(es.closed).toBe(true);
  });

  it("transitions to failed on structured error event", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("error", JSON.stringify({ message: "Task failed" }));
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Task failed");
    expect(es.closed).toBe(true);
  });

  it("transitions to failed on network error (plain Event)", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    act(() => {
      es.emitPlainError();
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Connection lost");
    expect(es.closed).toBe(true);
  });

  it("transitions to completed on done event", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("done");
    });

    expect(result.current.status).toBe("completed");
    expect(es.closed).toBe(true);
  });

  it("calls onResult callback", () => {
    const onResult = vi.fn();
    renderHook(() => useTaskStream("task-1", { onResult }));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("result", JSON.stringify({ output: "hi" }));
    });

    expect(onResult).toHaveBeenCalledWith({ output: "hi" });
  });

  it("calls onError callback on structured error", () => {
    const onError = vi.fn();
    renderHook(() => useTaskStream("task-1", { onError }));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("error", JSON.stringify({ message: "bad" }));
    });

    expect(onError).toHaveBeenCalledWith("bad");
  });

  it("calls onNetworkError callback on plain error", () => {
    const onNetworkError = vi.fn();
    const onError = vi.fn();
    renderHook(() => useTaskStream("task-1", { onNetworkError, onError }));
    const es = MockEventSource.latest();

    act(() => {
      es.emitPlainError();
    });

    expect(onNetworkError).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("falls back to onError when onNetworkError is not provided", () => {
    const onError = vi.fn();
    renderHook(() => useTaskStream("task-1", { onError }));
    const es = MockEventSource.latest();

    act(() => {
      es.emitPlainError();
    });

    expect(onError).toHaveBeenCalledWith("Connection lost");
  });

  it("calls onProgress and onToolCall callbacks", () => {
    const onProgress = vi.fn();
    const onToolCall = vi.fn();
    renderHook(() => useTaskStream("task-1", { onProgress, onToolCall }));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("progress", JSON.stringify({ message: "Working..." }));
      es.emit("tool_call", JSON.stringify({ tool: "search", id: "t1", args: "{}" }));
    });

    expect(onProgress).toHaveBeenCalledWith("Working...");
    expect(onToolCall).toHaveBeenCalledWith("search", "t1", "{}");
  });

  it("calls onDone callback", () => {
    const onDone = vi.fn();
    renderHook(() => useTaskStream("task-1", { onDone }));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("done");
    });

    expect(onDone).toHaveBeenCalled();
  });

  it("closes old stream and opens new one when taskId changes", () => {
    const { rerender } = renderHook(
      ({ id }) => useTaskStream(id),
      { initialProps: { id: "task-1" as string | null } },
    );

    const firstEs = MockEventSource.latest();
    expect(firstEs.url).toBe("/api/workspace-tasks/task-1/stream");

    rerender({ id: "task-2" });

    expect(firstEs.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.latest().url).toBe("/api/workspace-tasks/task-2/stream");
  });

  it("closes stream when taskId becomes null", () => {
    const { result, rerender } = renderHook(
      ({ id }) => useTaskStream(id),
      { initialProps: { id: "task-1" as string | null } },
    );

    const es = MockEventSource.latest();

    rerender({ id: null });

    expect(es.closed).toBe(true);
    expect(result.current.status).toBe("idle");
  });

  it("closes stream on unmount", () => {
    const { unmount } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    unmount();

    expect(es.closed).toBe(true);
  });

  it("fires timeout and sets failed status", () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useTaskStream("task-1", { timeout: 1000 }));
    const es = MockEventSource.latest();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.status).toBe("failed");
    expect(result.current.error).toBe("Stream timed out");
    expect(es.closed).toBe(true);

    vi.useRealTimers();
  });

  it("disables timeout when set to 0", () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useTaskStream("task-1", { timeout: 0 }));

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(result.current.status).toBe("connecting");

    vi.useRealTimers();
  });

  it("close() manually stops the stream and resets state", () => {
    const { result } = renderHook(() => useTaskStream("task-1"));
    const es = MockEventSource.latest();

    act(() => {
      es.emit("progress", JSON.stringify({ message: "Working..." }));
    });

    expect(result.current.status).toBe("streaming");

    act(() => {
      result.current.close();
    });

    expect(result.current.status).toBe("idle");
    expect(es.closed).toBe(true);
  });

  it("picks up latest callbacks without reconnecting", () => {
    const onResult1 = vi.fn();
    const onResult2 = vi.fn();

    const { rerender } = renderHook(
      ({ cb }) => useTaskStream("task-1", { onResult: cb }),
      { initialProps: { cb: onResult1 } },
    );

    // Only 1 EventSource should exist (no reconnect)
    expect(MockEventSource.instances).toHaveLength(1);

    rerender({ cb: onResult2 });

    // Still 1 EventSource
    expect(MockEventSource.instances).toHaveLength(1);

    const es = MockEventSource.latest();
    act(() => {
      es.emit("result", JSON.stringify({ output: "done" }));
    });

    expect(onResult1).not.toHaveBeenCalled();
    expect(onResult2).toHaveBeenCalledWith({ output: "done" });
  });
});

// ---------------------------------------------------------------------------
// streamTaskAsPromise
// ---------------------------------------------------------------------------

describe("streamTaskAsPromise", () => {
  it("resolves with data on result event", async () => {
    const promise = streamTaskAsPromise("task-1");
    const es = MockEventSource.latest();

    es.emit("result", JSON.stringify({ output: "Review complete" }));

    await expect(promise).resolves.toEqual({ output: "Review complete" });
    expect(es.closed).toBe(true);
  });

  it("resolves void on done event", async () => {
    const promise = streamTaskAsPromise("task-1");
    const es = MockEventSource.latest();

    es.emit("done");

    await expect(promise).resolves.toBeUndefined();
    expect(es.closed).toBe(true);
  });

  it("rejects on structured error", async () => {
    const promise = streamTaskAsPromise("task-1");
    const es = MockEventSource.latest();

    es.emit("error", JSON.stringify({ message: "Agent timeout" }));

    await expect(promise).rejects.toThrow("Agent timeout");
    expect(es.closed).toBe(true);
  });

  it("rejects on network error", async () => {
    const promise = streamTaskAsPromise("task-1");
    const es = MockEventSource.latest();

    es.emitPlainError();

    await expect(promise).rejects.toThrow("Connection lost");
    expect(es.closed).toBe(true);
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();

    const promise = streamTaskAsPromise("task-1", 2000);
    const es = MockEventSource.latest();

    vi.advanceTimersByTime(2000);

    await expect(promise).rejects.toThrow("Stream timed out");
    expect(es.closed).toBe(true);

    vi.useRealTimers();
  });

  it("disables timeout when set to 0", () => {
    vi.useFakeTimers();

    streamTaskAsPromise("task-1", 0);
    const es = MockEventSource.latest();

    vi.advanceTimersByTime(10 * 60 * 1000);

    expect(es.closed).toBe(false);

    // Clean up
    es.emit("done");
    vi.useRealTimers();
  });
});
