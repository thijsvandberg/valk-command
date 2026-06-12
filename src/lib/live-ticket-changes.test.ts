import { describe, it, expect, vi } from "vitest";
import { publishTicketChange, subscribeTicketChange } from "./live-ticket-changes";
import type { TicketEvent } from "./ticket-events";

function event(ticketKey: string): TicketEvent {
  return { type: "ticket:changed", ticketKey, kinds: ["status"], origin: null };
}

describe("live-ticket-changes", () => {
  it("delivers an event only to subscribers of that key", () => {
    const forA = vi.fn();
    const forB = vi.fn();
    const unsubA = subscribeTicketChange("VPL-1", forA);
    const unsubB = subscribeTicketChange("VPL-2", forB);

    publishTicketChange(event("VPL-1"));

    expect(forA).toHaveBeenCalledTimes(1);
    expect(forB).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });

  it("supports multiple subscribers per key", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsub1 = subscribeTicketChange("VPL-1", first);
    const unsub2 = subscribeTicketChange("VPL-1", second);

    publishTicketChange(event("VPL-1"));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsub1();
    unsub2();
  });

  it("unsubscribe stops delivery", () => {
    const listener = vi.fn();
    const unsub = subscribeTicketChange("VPL-1", listener);
    unsub();
    publishTicketChange(event("VPL-1"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("publishing with no subscribers is a no-op", () => {
    expect(() => publishTicketChange(event("VPL-99"))).not.toThrow();
  });
});
