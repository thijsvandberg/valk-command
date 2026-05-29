import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitRefinementEvent, onRefinementEvent, type RefinementEvent } from "./refinement-events";

describe("refinement-events", () => {
  let received: RefinementEvent[];
  let unsubscribe: () => void;

  beforeEach(() => {
    received = [];
  });

  it("emitRefinementEvent broadcasts to listener", () => {
    unsubscribe = onRefinementEvent((e) => received.push(e));
    const event: RefinementEvent = { type: "session:created", sessionId: "s1" };
    emitRefinementEvent(event);
    expect(received).toEqual([event]);
    unsubscribe();
  });

  it("onRefinementEvent receives events with correct payload", () => {
    const handler = vi.fn();
    unsubscribe = onRefinementEvent(handler);
    emitRefinementEvent({ type: "tickets:updated", ticketKey: "VALK-1" });
    expect(handler).toHaveBeenCalledWith({ type: "tickets:updated", ticketKey: "VALK-1" });
    unsubscribe();
  });

  it("multiple listeners receive the same event", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = onRefinementEvent(handler1);
    const unsub2 = onRefinementEvent(handler2);

    const event: RefinementEvent = { type: "session:updated", sessionId: "s2" };
    emitRefinementEvent(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
    unsub1();
    unsub2();
  });

  it("unsubscribe removes the listener", () => {
    const handler = vi.fn();
    unsubscribe = onRefinementEvent(handler);
    unsubscribe();

    emitRefinementEvent({ type: "session:deleted" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribe only removes its own listener", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const unsub1 = onRefinementEvent(handler1);
    const unsub2 = onRefinementEvent(handler2);

    unsub1();
    emitRefinementEvent({ type: "bulk-suggest:complete" });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
    unsub2();
  });

  it("handles all event types", () => {
    const handler = vi.fn();
    unsubscribe = onRefinementEvent(handler);

    const types: RefinementEvent["type"][] = [
      "session:created",
      "session:updated",
      "session:deleted",
      "bulk-suggest:progress",
      "bulk-suggest:complete",
      "tickets:updated",
    ];

    for (const type of types) {
      emitRefinementEvent({ type });
    }

    expect(handler).toHaveBeenCalledTimes(types.length);
    unsubscribe();
  });
});
