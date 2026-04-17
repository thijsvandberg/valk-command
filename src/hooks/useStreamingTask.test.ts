import { describe, it, expect, vi } from "vitest";
import { attachTaskStreamListeners } from "./useStreamingTask";

type ESListener = (event: MessageEvent | Event) => void;

class MockEventSource {
  private listeners: Record<string, ESListener[]> = {};

  addEventListener(type: string, listener: ESListener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  emit(type: string, data?: unknown) {
    const handlers = this.listeners[type] ?? [];
    if (data === undefined) {
      handlers.forEach((h) => h(new Event(type)));
    } else {
      handlers.forEach((h) =>
        h(new MessageEvent(type, {
          data: typeof data === "string" ? data : JSON.stringify(data),
        })),
      );
    }
  }
}

describe("attachTaskStreamListeners", () => {
  it("calls onProgress with message from progress event", () => {
    const es = new MockEventSource();
    const onProgress = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onProgress });

    es.emit("progress", { message: "Working..." });

    expect(onProgress).toHaveBeenCalledWith("Working...");
  });

  it("ignores progress event with invalid JSON", () => {
    const es = new MockEventSource();
    const onProgress = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onProgress });

    es.emit("progress", "not-json");

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("calls onToolCall with tool name, id, and args from tool_call event", () => {
    const es = new MockEventSource();
    const onToolCall = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onToolCall });

    es.emit("tool_call", { tool: "mcp__jira__get_issue", id: "tc-1", args: '{"key":"VPL-1"}' });

    expect(onToolCall).toHaveBeenCalledWith("mcp__jira__get_issue", "tc-1", '{"key":"VPL-1"}');
  });

  it("calls onResult with parsed data from result event", () => {
    const es = new MockEventSource();
    const onResult = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onResult });

    es.emit("result", { output: "Done", status: "completed" });

    expect(onResult).toHaveBeenCalledWith({ output: "Done", status: "completed" });
  });

  it("ignores result event with invalid JSON", () => {
    const es = new MockEventSource();
    const onResult = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onResult });

    es.emit("result", "not-json");

    expect(onResult).not.toHaveBeenCalled();
  });

  it("calls onStructuredError with parsed message from MessageEvent error", () => {
    const es = new MockEventSource();
    const onStructuredError = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onStructuredError });

    es.emit("error", { message: "Task failed" });

    expect(onStructuredError).toHaveBeenCalledWith("Task failed");
  });

  it("calls onStructuredError with 'Unknown error' when error JSON has no message", () => {
    const es = new MockEventSource();
    const onStructuredError = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onStructuredError });

    es.emit("error", "not-json");

    expect(onStructuredError).toHaveBeenCalledWith("Unknown error");
  });

  it("calls onNetworkError for plain Event error (connection drop)", () => {
    const es = new MockEventSource();
    const onNetworkError = vi.fn();
    const onStructuredError = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onNetworkError, onStructuredError });

    // Emit a plain Event (not MessageEvent) as a connection-level error
    const listeners = (es as unknown as { listeners: Record<string, ESListener[]> }).listeners;
    const handlers = listeners["error"] ?? [];
    handlers.forEach((h) => h(new Event("error")));

    expect(onNetworkError).toHaveBeenCalled();
    expect(onStructuredError).not.toHaveBeenCalled();
  });

  it("calls onDone from done event", () => {
    const es = new MockEventSource();
    const onDone = vi.fn();
    attachTaskStreamListeners(es as unknown as EventSource, { onDone });

    es.emit("done");

    expect(onDone).toHaveBeenCalled();
  });

  it("does not throw when optional handlers are omitted", () => {
    const es = new MockEventSource();
    attachTaskStreamListeners(es as unknown as EventSource, {});

    // All events should be silently ignored with no handlers
    expect(() => {
      es.emit("progress", { message: "hi" });
      es.emit("tool_call", { tool: "foo" });
      es.emit("result", { output: "x" });
      es.emit("error", { message: "err" });
      es.emit("done");
    }).not.toThrow();
  });
});
