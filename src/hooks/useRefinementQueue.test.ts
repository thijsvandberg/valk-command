import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useRefinementQueue } from "./useRefinementQueue";
import type { Ticket } from "@/types/ticket";
import type { RefinementSessionResponse } from "@/lib/api-client";

vi.mock("@dnd-kit/core", () => ({
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn().mockReturnValue({}),
  useSensors: vi.fn().mockReturnValue([]),
}));

vi.mock("@dnd-kit/sortable", () => ({
  arrayMove: (arr: string[], from: number, to: number) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  },
}));

vi.mock("@/lib/api-client", () => ({
  refinementSessions: {
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/components/refinement-session/refinement-utils", () => ({
  MAX_TICKETS: 12,
}));

import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";

function makeTicket(key: string, readiness?: string): Ticket {
  return { key, title: `Ticket ${key}`, readiness: readiness ?? null } as Ticket;
}

function makeSession(id: string, keys: string[]): RefinementSessionResponse {
  return {
    id,
    ticketKeys: keys,
    ticketCount: keys.length,
    status: "draft",
    name: "Test Session",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinnedSprintIds: [],
    generalComment: null,
    scheduledFor: null,
    currentIndex: 0,
  } as RefinementSessionResponse;
}

const defaultOpts = {
  resolvedSessionId: null as string | null,
  activeSession: null as RefinementSessionResponse | null,
  mutateSessions: vi.fn().mockResolvedValue(undefined),
  availableTickets: [makeTicket("VPL-1"), makeTicket("VPL-2"), makeTicket("VPL-3")],
  allTickets: [makeTicket("VPL-1"), makeTicket("VPL-2"), makeTicket("VPL-3")],
};

describe("useRefinementQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial queue from activeSession.ticketKeys", () => {
    const session = makeSession("s1", ["VPL-1", "VPL-2"]);
    const { result } = renderHook(() =>
      useRefinementQueue({ ...defaultOpts, resolvedSessionId: "s1", activeSession: session }),
    );
    expect(result.current.queue).toEqual(["VPL-1", "VPL-2"]);
  });

  it("falls back to localQueue when no active session", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    expect(result.current.queue).toEqual([]);
  });

  it("toggle ticket: adds when not in queue", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    expect(result.current.queue).toContain("VPL-1");
  });

  it("toggle ticket: removes when already in queue", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    expect(result.current.queue).not.toContain("VPL-1");
  });

  it("shift-click range selection", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    act(() => { result.current.toggleTicket("VPL-3", 2, true); });
    expect(result.current.queue).toContain("VPL-1");
    expect(result.current.queue).toContain("VPL-2");
    expect(result.current.queue).toContain("VPL-3");
  });

  it("respects MAX_TICKETS limit", () => {
    const tickets = Array.from({ length: 13 }, (_, i) => makeTicket(`VPL-${i}`));
    const { result } = renderHook(() =>
      useRefinementQueue({ ...defaultOpts, availableTickets: tickets, allTickets: tickets }),
    );

    for (let i = 0; i < 13; i++) {
      act(() => { result.current.toggleTicket(`VPL-${i}`, i, false); });
    }
    expect(result.current.queue.length).toBe(12);
  });

  it("debounces persistence by 400ms", () => {
    const session = makeSession("s1", []);
    const mutateSessions = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useRefinementQueue({
        ...defaultOpts,
        resolvedSessionId: "s1",
        activeSession: session,
        mutateSessions,
      }),
    );

    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    expect(refinementSessionsApi.update).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(400); });
    expect(refinementSessionsApi.update).toHaveBeenCalledTimes(1);
  });

  it("flushes debounce timer explicitly", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    act(() => { result.current.flushPersistTimer(); });
    // Timer should be cleared (no pending operation)
  });

  it("drag-end reorders queue", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    act(() => { result.current.toggleTicket("VPL-2", 1, false); });
    act(() => { result.current.toggleTicket("VPL-3", 2, false); });

    act(() => {
      result.current.handleDragEnd({
        active: { id: "VPL-1" },
        over: { id: "VPL-3" },
      } as never);
    });

    expect(result.current.queue).toEqual(["VPL-2", "VPL-3", "VPL-1"]);
  });

  it("ignores drag-end when active === over", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });

    const queueBefore = [...result.current.queue];
    act(() => {
      result.current.handleDragEnd({
        active: { id: "VPL-1" },
        over: { id: "VPL-1" },
      } as never);
    });
    expect(result.current.queue).toEqual(queueBefore);
  });

  it("ready-to-refine toggle adds all ready tickets", () => {
    const tickets = [
      makeTicket("VPL-1", "ready_to_refine"),
      makeTicket("VPL-2", "drafting"),
      makeTicket("VPL-3", "ready_to_refine"),
    ];
    const { result } = renderHook(() =>
      useRefinementQueue({ ...defaultOpts, availableTickets: tickets, allTickets: tickets }),
    );

    act(() => { result.current.handleToggleReadyToRefine(); });
    expect(result.current.queue).toContain("VPL-1");
    expect(result.current.queue).toContain("VPL-3");
    expect(result.current.queue).not.toContain("VPL-2");
  });

  it("orderedTickets floats selected tickets to the top, preserving relative order", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    expect(result.current.orderedTickets.map((t) => t.key)).toEqual(["VPL-1", "VPL-2", "VPL-3"]);

    act(() => { result.current.toggleTicket("VPL-2", 1, false); });
    // VPL-2 jumps to the top; the rest keep their existing order.
    expect(result.current.orderedTickets.map((t) => t.key)).toEqual(["VPL-2", "VPL-1", "VPL-3"]);
  });

  it("orderedTickets keeps multiple selected tickets in their available order", () => {
    const session = makeSession("s1", ["VPL-3", "VPL-1"]);
    const { result } = renderHook(() =>
      useRefinementQueue({ ...defaultOpts, resolvedSessionId: "s1", activeSession: session }),
    );
    // Selected come first ordered by their position in availableTickets (1 then 3),
    // not by queue order, followed by the unselected remainder.
    expect(result.current.orderedTickets.map((t) => t.key)).toEqual(["VPL-1", "VPL-3", "VPL-2"]);
  });

  it("remove from queue", () => {
    const { result } = renderHook(() => useRefinementQueue(defaultOpts));
    act(() => { result.current.toggleTicket("VPL-1", 0, false); });
    act(() => { result.current.toggleTicket("VPL-2", 1, false); });
    act(() => { result.current.removeFromQueue("VPL-1"); });
    expect(result.current.queue).toEqual(["VPL-2"]);
  });

  it("optimistic mutation via mutateSessions", () => {
    const session = makeSession("s1", ["VPL-1"]);
    const mutateSessions = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useRefinementQueue({
        ...defaultOpts,
        resolvedSessionId: "s1",
        activeSession: session,
        mutateSessions,
      }),
    );

    act(() => { result.current.toggleTicket("VPL-2", 1, false); });
    expect(mutateSessions).toHaveBeenCalledWith(expect.any(Function), false);
  });
});
