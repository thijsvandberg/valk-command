import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitTicketEvent, onTicketEvent, type TicketEvent } from "./ticket-events";

describe("ticket-events", () => {
  let received: TicketEvent[];

  beforeEach(() => {
    received = [];
  });

  it("emitTicketEvent broadcasts to listener", () => {
    const unsubscribe = onTicketEvent((e) => received.push(e));
    const event: TicketEvent = { type: "content:changed", ticketKey: "VALK-1" };
    emitTicketEvent(event);
    expect(received).toEqual([event]);
    unsubscribe();
  });

  it("multiple listeners receive the same event", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = onTicketEvent(handler1);
    const unsub2 = onTicketEvent(handler2);

    const event: TicketEvent = { type: "content:changed", ticketKey: "VALK-2" };
    emitTicketEvent(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
    unsub1();
    unsub2();
  });

  it("unsubscribe only removes its own listener", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = onTicketEvent(handler1);
    const unsub2 = onTicketEvent(handler2);

    unsub1();
    emitTicketEvent({ type: "content:changed", ticketKey: "VALK-3" });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
    unsub2();
  });
});
