import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRefinementStream } from "./useRefinementStream";

vi.mock("swr", () => ({
  mutate: vi.fn(),
}));

import { mutate as globalMutate } from "swr";

type Listener = (event: MessageEvent | Event) => void;

class MockEventSource {
  url: string;
  listeners: Record<string, Listener[]> = {};
  closed = false;
  onerror: ((e: Event) => void) | null = null;

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

  emit(type: string, data: string) {
    const handlers = this.listeners[type] ?? [];
    handlers.forEach((h) => h(new MessageEvent(type, { data })));
  }

  triggerError() {
    this.onerror?.(new Event("error"));
  }

  static instances: MockEventSource[] = [];
  static clear() { MockEventSource.instances = []; }
  static latest(): MockEventSource {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  MockEventSource.clear();
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRefinementStream", () => {
  it("creates EventSource on mount", () => {
    renderHook(() => useRefinementStream("session-1"));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.latest().url).toBe("/api/refinement-sessions/stream");
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useRefinementStream("session-1"));
    const es = MockEventSource.latest();
    unmount();
    expect(es.closed).toBe(true);
  });

  it("parses JSON event data correctly", () => {
    renderHook(() => useRefinementStream("session-1"));
    const es = MockEventSource.latest();
    es.emit("session:created", JSON.stringify({ type: "session:created", sessionId: "s1" }));
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions");
  });

  it("handles malformed JSON gracefully", () => {
    renderHook(() => useRefinementStream("session-1"));
    const es = MockEventSource.latest();
    es.emit("session:created", "not-json");
    expect(globalMutate).not.toHaveBeenCalled();
  });

  it("session:created triggers /api/refinement-sessions mutation", () => {
    renderHook(() => useRefinementStream(null));
    const es = MockEventSource.latest();
    es.emit("session:created", JSON.stringify({ type: "session:created" }));
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions");
  });

  it("session:updated triggers mutation", () => {
    renderHook(() => useRefinementStream(null));
    const es = MockEventSource.latest();
    es.emit("session:updated", JSON.stringify({ type: "session:updated" }));
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions");
  });

  it("session:deleted triggers mutation", () => {
    renderHook(() => useRefinementStream(null));
    const es = MockEventSource.latest();
    es.emit("session:deleted", JSON.stringify({ type: "session:deleted" }));
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions");
  });

  it("bulk-suggest:progress with matching sessionId triggers specific mutations", () => {
    renderHook(() => useRefinementStream("session-1"));
    const es = MockEventSource.latest();
    es.emit("bulk-suggest:progress", JSON.stringify({
      type: "bulk-suggest:progress",
      sessionId: "session-1",
    }));
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions/session-1/suggestion-counts");
    expect(globalMutate).toHaveBeenCalledWith("/api/conversations/bulk-suggest-session-1");
  });

  it("bulk-suggest:progress with non-matching sessionId is ignored", () => {
    renderHook(() => useRefinementStream("session-1"));
    const es = MockEventSource.latest();
    es.emit("bulk-suggest:progress", JSON.stringify({
      type: "bulk-suggest:progress",
      sessionId: "other-session",
    }));
    expect(globalMutate).not.toHaveBeenCalled();
  });

  it("bulk-suggest:complete triggers multiple mutations", () => {
    renderHook(() => useRefinementStream("session-1"));
    const es = MockEventSource.latest();
    es.emit("bulk-suggest:complete", JSON.stringify({
      type: "bulk-suggest:complete",
      sessionId: "session-1",
    }));
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions/session-1/suggestion-counts");
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions/session-1/bulk-suggest-subtasks");
    expect(globalMutate).toHaveBeenCalledWith("/api/conversations/bulk-suggest-session-1");
  });

  it("tickets:updated triggers /api/tickets mutation", () => {
    renderHook(() => useRefinementStream(null));
    const es = MockEventSource.latest();
    es.emit("tickets:updated", JSON.stringify({ type: "tickets:updated" }));
    expect(globalMutate).toHaveBeenCalledWith("/api/tickets");
  });

  it("reconnects after 3 seconds on error", () => {
    renderHook(() => useRefinementStream("session-1"));
    expect(MockEventSource.instances).toHaveLength(1);

    const es = MockEventSource.latest();
    es.triggerError();
    expect(es.closed).toBe(true);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(MockEventSource.instances).toHaveLength(2);
  });
});
