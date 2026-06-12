import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BridgeEventEnvelope } from "@/lib/event-envelope";
import { useRefinementStream } from "./useRefinementStream";

vi.mock("swr", () => ({
  mutate: vi.fn(),
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

import { mutate as globalMutate } from "swr";

function emitRefinement(event: Record<string, unknown>) {
  const envelope = { channel: "refinement", event } as unknown as BridgeEventEnvelope;
  busHandlers.forEach((handler) => handler(envelope));
}

beforeEach(() => {
  vi.clearAllMocks();
  busHandlers.clear();
});

describe("useRefinementStream", () => {
  it("subscribes to the shared event bus on mount", () => {
    renderHook(() => useRefinementStream("session-1"));
    expect(busHandlers.size).toBe(1);
  });

  it("unsubscribes from the bus on unmount", () => {
    const { unmount } = renderHook(() => useRefinementStream("session-1"));
    expect(busHandlers.size).toBe(1);
    unmount();
    expect(busHandlers.size).toBe(0);
  });

  it("ignores ticket envelopes", () => {
    renderHook(() => useRefinementStream("session-1"));
    const envelope = {
      channel: "ticket",
      event: { type: "ticket:changed", ticketKey: "VPL-1", kinds: ["status"] },
    };
    busHandlers.forEach((handler) => handler(envelope));
    expect(globalMutate).not.toHaveBeenCalled();
  });

  it("session:created triggers /api/refinement-sessions mutation", () => {
    renderHook(() => useRefinementStream(null));
    emitRefinement({ type: "session:created" });
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions");
  });

  it("session:updated triggers mutation", () => {
    renderHook(() => useRefinementStream(null));
    emitRefinement({ type: "session:updated" });
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions");
  });

  it("session:deleted triggers mutation", () => {
    renderHook(() => useRefinementStream(null));
    emitRefinement({ type: "session:deleted" });
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions");
  });

  it("bulk-suggest:progress with matching sessionId triggers specific mutations", () => {
    renderHook(() => useRefinementStream("session-1"));
    emitRefinement({ type: "bulk-suggest:progress", sessionId: "session-1" });
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions/session-1/suggestion-counts");
    expect(globalMutate).toHaveBeenCalledWith("/api/conversations/bulk-suggest-session-1");
  });

  it("bulk-suggest:progress with non-matching sessionId is ignored", () => {
    renderHook(() => useRefinementStream("session-1"));
    emitRefinement({ type: "bulk-suggest:progress", sessionId: "other-session" });
    expect(globalMutate).not.toHaveBeenCalled();
  });

  it("bulk-suggest:complete triggers multiple mutations", () => {
    renderHook(() => useRefinementStream("session-1"));
    emitRefinement({ type: "bulk-suggest:complete", sessionId: "session-1" });
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions/session-1/suggestion-counts");
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions/session-1/bulk-suggest-subtasks");
    expect(globalMutate).toHaveBeenCalledWith("/api/conversations/bulk-suggest-session-1");
  });

  it("tickets:updated triggers /api/tickets mutation", () => {
    renderHook(() => useRefinementStream(null));
    emitRefinement({ type: "tickets:updated" });
    expect(globalMutate).toHaveBeenCalledWith("/api/tickets");
  });

  it("uses the latest sessionId without re-subscribing", () => {
    const { rerender } = renderHook(({ id }) => useRefinementStream(id), {
      initialProps: { id: "session-1" as string | null },
    });
    rerender({ id: "session-2" });
    expect(busHandlers.size).toBe(1);
    emitRefinement({ type: "bulk-suggest:progress", sessionId: "session-2" });
    expect(globalMutate).toHaveBeenCalledWith("/api/refinement-sessions/session-2/suggestion-counts");
  });
});
