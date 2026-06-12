import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitTicketEvent, onTicketEvent, originFromRequest, type TicketEvent } from "./ticket-events";

describe("ticket-events", () => {
  let received: TicketEvent[];

  beforeEach(() => {
    received = [];
  });

  it("emitTicketEvent broadcasts to listener", () => {
    const unsubscribe = onTicketEvent((e) => received.push(e));
    const event: TicketEvent = { type: "ticket:changed", ticketKey: "VALK-1", kinds: ["content"] };
    emitTicketEvent(event);
    expect(received).toEqual([event]);
    unsubscribe();
  });

  it("carries the change kinds and origin on the event", () => {
    const unsubscribe = onTicketEvent((e) => received.push(e));
    emitTicketEvent({ type: "ticket:changed", ticketKey: "VALK-9", kinds: ["status", "comment"], origin: "tab-1" });
    expect(received).toHaveLength(1);
    expect(received[0].kinds).toEqual(["status", "comment"]);
    expect(received[0].origin).toBe("tab-1");
    unsubscribe();
  });

  it("multiple listeners receive the same event", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = onTicketEvent(handler1);
    const unsub2 = onTicketEvent(handler2);

    const event: TicketEvent = { type: "ticket:changed", ticketKey: "VALK-2", kinds: ["points"] };
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
    emitTicketEvent({ type: "ticket:changed", ticketKey: "VALK-3", kinds: ["content"] });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
    unsub2();
  });

  it("originFromRequest reads the client header", () => {
    const withHeader = new Request("http://localhost/api", { headers: { "x-bridge-client": "tab-42" } });
    const without = new Request("http://localhost/api");
    expect(originFromRequest(withHeader)).toBe("tab-42");
    expect(originFromRequest(without)).toBeNull();
  });
});
