import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BridgeEventEnvelope } from "@/lib/event-envelope";
import { useTicketEvents } from "./useTicketEvents";

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

function emitTicket(event: Record<string, unknown>) {
  const envelope = { channel: "ticket", event } as unknown as BridgeEventEnvelope;
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

describe("useTicketEvents", () => {
  it("subscribes to the shared event bus", () => {
    renderHook(() => useTicketEvents("VPL-1", vi.fn()));
    expect(busHandlers.size).toBe(1);
  });

  it("does not subscribe for a null key", () => {
    renderHook(() => useTicketEvents(null, vi.fn()));
    expect(busHandlers.size).toBe(0);
  });

  it("does not subscribe for a DRAFT key", () => {
    renderHook(() => useTicketEvents("DRAFT-abc", vi.fn()));
    expect(busHandlers.size).toBe(0);
  });

  it("invokes onChange when a ticket:changed event arrives", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: "tab-1" });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledWith({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: "tab-1" });
  });

  it("ignores events for other ticket keys", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-2", kinds: ["comment"] });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores refinement envelopes", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    const envelope = { channel: "refinement", event: { type: "tickets:updated" } };
    busHandlers.forEach((handler) => handler(envelope));
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("coalesces a burst of events into a single callback with merged kinds", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: "tab-1" });
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["points", "status"], origin: "tab-1" });
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: "tab-1" });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledTimes(1);
    const event = onChange.mock.calls[0][0];
    expect([...event.kinds].sort()).toEqual(["comment", "points", "status"]);
    expect(event.origin).toBe("tab-1");
  });

  it("drops the origin when a coalesced burst has mixed origins", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"], origin: "tab-1" });
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["comment"], origin: null });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].origin).toBeNull();
  });

  it("delivers immediately when coalescing is disabled", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange, { coalesceMs: 0 }));
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["content"] });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores events without kinds", () => {
    const onChange = vi.fn();
    renderHook(() => useTicketEvents("VPL-1", onChange));
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: [] });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("unsubscribes from the bus on unmount", () => {
    const { unmount } = renderHook(() => useTicketEvents("VPL-1", vi.fn()));
    expect(busHandlers.size).toBe(1);
    unmount();
    expect(busHandlers.size).toBe(0);
  });

  it("uses the latest onChange without re-subscribing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useTicketEvents("VPL-1", cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    expect(busHandlers.size).toBe(1);
    emitTicket({ type: "ticket:changed", ticketKey: "VPL-1", kinds: ["content"] });
    act(() => { vi.advanceTimersByTime(200); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
