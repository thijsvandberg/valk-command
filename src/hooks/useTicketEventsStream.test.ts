import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ticket-cache", () => ({
  revalidateTicketCachesFor: vi.fn(),
}));

import { useTicketEventsStream } from "./useTicketEventsStream";
import { subscribeTicketChange } from "@/lib/live-ticket-changes";
import { revalidateTicketCachesFor } from "@/lib/ticket-cache";

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

function emitChange(key: string, kinds: string[], origin: string | null = null) {
  MockEventSource.latest().emit(
    "ticket:changed",
    JSON.stringify({ type: "ticket:changed", ticketKey: key, kinds, origin }),
  );
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

describe("useTicketEventsStream", () => {
  it("opens a single connection to the broadcast stream", () => {
    renderHook(() => useTicketEventsStream());
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.latest().url).toBe("/api/tickets/events");
  });

  it("revalidates the changed ticket's caches and publishes to row subscribers", () => {
    renderHook(() => useTicketEventsStream());
    const received: unknown[] = [];
    const unsub = subscribeTicketChange("VPL-1", (e) => received.push(e));

    emitChange("VPL-1", ["status"]);
    act(() => { vi.advanceTimersByTime(200); });

    expect(revalidateTicketCachesFor).toHaveBeenCalledWith("VPL-1");
    expect(received).toHaveLength(1);
    expect((received[0] as { kinds: string[] }).kinds).toEqual(["status"]);
    unsub();
  });

  it("does not notify subscribers of other tickets", () => {
    renderHook(() => useTicketEventsStream());
    const forOther = vi.fn();
    const unsub = subscribeTicketChange("VPL-2", forOther);

    emitChange("VPL-1", ["status"]);
    act(() => { vi.advanceTimersByTime(200); });

    expect(forOther).not.toHaveBeenCalled();
    expect(revalidateTicketCachesFor).not.toHaveBeenCalledWith("VPL-2");
    unsub();
  });

  it("coalesces a burst for the same ticket into one revalidate", () => {
    renderHook(() => useTicketEventsStream());
    emitChange("VPL-1", ["status"]);
    emitChange("VPL-1", ["points"]);
    emitChange("VPL-1", ["comment"]);
    act(() => { vi.advanceTimersByTime(200); });

    expect(revalidateTicketCachesFor).toHaveBeenCalledTimes(1);
  });

  it("merges kinds across a coalesced burst", () => {
    renderHook(() => useTicketEventsStream());
    const received: Array<{ kinds: string[] }> = [];
    const unsub = subscribeTicketChange("VPL-1", (e) => received.push(e as { kinds: string[] }));

    emitChange("VPL-1", ["status"]);
    emitChange("VPL-1", ["comment"]);
    act(() => { vi.advanceTimersByTime(200); });

    expect(received).toHaveLength(1);
    expect([...received[0].kinds].sort()).toEqual(["comment", "status"]);
    unsub();
  });

  it("handles different tickets independently", () => {
    renderHook(() => useTicketEventsStream());
    emitChange("VPL-1", ["status"]);
    emitChange("VPL-2", ["comment"]);
    act(() => { vi.advanceTimersByTime(200); });

    expect(revalidateTicketCachesFor).toHaveBeenCalledWith("VPL-1");
    expect(revalidateTicketCachesFor).toHaveBeenCalledWith("VPL-2");
  });

  it("ignores malformed JSON and empty kinds", () => {
    renderHook(() => useTicketEventsStream());
    MockEventSource.latest().emit("ticket:changed", "not-json");
    emitChange("VPL-1", []);
    act(() => { vi.advanceTimersByTime(200); });
    expect(revalidateTicketCachesFor).not.toHaveBeenCalled();
  });

  it("reconnects after an error", () => {
    renderHook(() => useTicketEventsStream());
    expect(MockEventSource.instances).toHaveLength(1);
    MockEventSource.latest().triggerError();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("closes the connection on unmount", () => {
    const { unmount } = renderHook(() => useTicketEventsStream());
    const es = MockEventSource.latest();
    unmount();
    expect(es.closed).toBe(true);
  });
});
