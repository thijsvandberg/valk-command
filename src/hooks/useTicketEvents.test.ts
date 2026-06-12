import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTicketEvents } from "./useTicketEvents";

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
    (this.listeners[type] ?? []).forEach((h) => h(new MessageEvent(type, { data })));
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

describe("useTicketEvents", () => {
  it("creates an EventSource for the ticket's events stream", () => {
    renderHook(() => useTicketEvents("VPL-1", vi.fn()));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.latest().url).toBe("/api/tickets/VPL-1/events");
  });

  it("does not subscribe for a null key", () => {
    renderHook(() => useTicketEvents(null, vi.fn()));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("does not subscribe for a DRAFT key", () => {
    renderHook(() => useTicketEvents("DRAFT-abc", vi.fn()));
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("invokes onChange when a ticket:changed event arrives", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    MockEventSource.latest().emit(
      "ticket:changed",
      JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: "tab-1" }),
    );
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledWith({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: "tab-1" });
  });

  it("coalesces a burst of events into a single callback with merged kinds", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    const es = MockEventSource.latest();
    es.emit("ticket:changed", JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: "tab-1" }));
    es.emit("ticket:changed", JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["points", "status"], origin: "tab-1" }));
    es.emit("ticket:changed", JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: "tab-1" }));
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledTimes(1);
    const event = onChange.mock.calls[0][0];
    expect([...event.kinds].sort()).toEqual(["comment", "points", "status"]);
    expect(event.origin).toBe("tab-1");
  });

  it("drops the origin when a coalesced burst has mixed origins", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    const es = MockEventSource.latest();
    es.emit("ticket:changed", JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: "tab-1" }));
    es.emit("ticket:changed", JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: null }));
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].origin).toBeNull();
  });

  it("delivers immediately when coalescing is disabled", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange, { coalesceMs: 0 }));
    MockEventSource.latest().emit(
      "ticket:changed",
      JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["content"] }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed JSON", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    MockEventSource.latest().emit("ticket:changed", "not-json");
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores events without kinds", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    MockEventSource.latest().emit("ticket:changed", JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: [] }));
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useTicketEvents("VPL-1", vi.fn()));
    const es = MockEventSource.latest();
    unmount();
    expect(es.closed).toBe(true);
  });

  it("reconnects after 3 seconds on error", () => {
    renderHook(() => useTicketEvents("VPL-1", vi.fn()));
    expect(MockEventSource.instances).toHaveLength(1);
    MockEventSource.latest().triggerError();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("uses the latest onChange without re-subscribing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useTicketEvents("VPL-1", cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    expect(MockEventSource.instances).toHaveLength(1);
    MockEventSource.latest().emit(
      "ticket:changed",
      JSON.stringify({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["content"] }),
    );
    act(() => { vi.advanceTimersByTime(200); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
