import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BridgeEventEnvelope } from "@/lib/event-envelope";

vi.mock("@/lib/ticket-cache", () => ({
  revalidateTicketCachesFor: vi.fn(),
}));

const { busHandlers } = vi.hoisted(() => ({
  busHandlers: new Set<(envelope: unknown) => void>(),
}));

vi.mock("@/lib/event-bus", () => ({
  subscribeEvents: (handler: (envelope: unknown) => void) => {
    busHandlers.add(handler);
    return () => {
      busHandlers.delete(handler);
    };
  },
}));

import { useTicketEventsStream } from "./useTicketEventsStream";
import { subscribeTicketChange } from "@/lib/live-ticket-changes";
import { revalidateTicketCachesFor } from "@/lib/ticket-cache";

function emitChange(key: string, kinds: string[], origin: string | null = null) {
  const envelope = {
    channel: "ticket",
    event: { type: "ticket:changed", ticketKey: key, kinds, origin },
  } as BridgeEventEnvelope;
  busHandlers.forEach((handler) => handler(envelope));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  busHandlers.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTicketEventsStream", () => {
  it("subscribes once to the shared event bus", () => {
    renderHook(() => useTicketEventsStream());
    expect(busHandlers.size).toBe(1);
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

  it("ignores refinement envelopes", () => {
    renderHook(() => useTicketEventsStream());
    const envelope = { channel: "refinement", event: { type: "tickets:updated" } };
    busHandlers.forEach((handler) => handler(envelope));
    act(() => { vi.advanceTimersByTime(200); });
    expect(revalidateTicketCachesFor).not.toHaveBeenCalled();
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

  it("ignores events with empty kinds", () => {
    renderHook(() => useTicketEventsStream());
    emitChange("VPL-1", []);
    act(() => { vi.advanceTimersByTime(200); });
    expect(revalidateTicketCachesFor).not.toHaveBeenCalled();
  });

  it("unsubscribes from the bus on unmount", () => {
    const { unmount } = renderHook(() => useTicketEventsStream());
    expect(busHandlers.size).toBe(1);
    unmount();
    expect(busHandlers.size).toBe(0);
  });

  it("does not flush pending changes after unmount", () => {
    const { unmount } = renderHook(() => useTicketEventsStream());
    emitChange("VPL-1", ["status"]);
    unmount();
    act(() => { vi.advanceTimersByTime(200); });
    expect(revalidateTicketCachesFor).not.toHaveBeenCalled();
  });
});
