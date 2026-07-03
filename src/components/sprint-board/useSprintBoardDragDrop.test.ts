import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useSprintBoardDragDrop } from "./useSprintBoardDragDrop";
import { jira } from "@/lib/api-client";
import type { Ticket } from "@/types/ticket";

const moveSprint = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api-client", () => ({
  jira: { moveSprint: (...a: unknown[]) => moveSprint(...a), rank: vi.fn().mockResolvedValue({}) },
  ApiError: class ApiError extends Error {},
}));

const moveTicketSprintCaches = vi.fn();
const revalidateMovedSprintLists = vi.fn();
vi.mock("@/lib/ticket-cache", () => ({
  moveTicketSprintCaches: (...a: unknown[]) => moveTicketSprintCaches(...a),
  revalidateMovedSprintLists: (...a: unknown[]) => revalidateMovedSprintLists(...a),
}));

const registerPendingMove = vi.fn();
const clearPendingMove = vi.fn();
const confirmPendingMove = vi.fn();
vi.mock("@/components/sprint-board/pendingSprintMoves", () => ({
  registerPendingMove: (...a: unknown[]) => registerPendingMove(...a),
  clearPendingMove: (...a: unknown[]) => clearPendingMove(...a),
  confirmPendingMove: (...a: unknown[]) => confirmPendingMove(...a),
}));

function makeTicket(key: string, sprintId?: string): Ticket {
  return {
    key, title: key, type: "story", epicKey: null, epic: null, flagged: false,
    jiraStatus: "TO DO", storyPoints: null, businessValue: null, assignee: null,
    qualityScore: null, readiness: null, poStatus: null, editState: "clean",
    notes: "", sprintId,
  } as Ticket;
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  const apiTickets = [makeTicket("VPL-1", "todo"), makeTicket("VPL-2", "todo")];
  return {
    activeSprintId: "todo",
    isAllView: false,
    groupBy: "none" as const,
    checkedTickets: new Set<string>(),
    setCheckedTickets: vi.fn(),
    tickets: apiTickets,
    apiTickets,
    mutateTickets: vi.fn(),
    sprintNameMap: { "140": "BT: 140" },
    showToast: vi.fn(),
    setPoPriorityOrder: vi.fn(),
    refreshMeter: vi.fn(),
    sortField: "rank" as const,
    activeViewId: null,
    onViewSprint: vi.fn(),
    dismissToast: vi.fn(),
    ...overrides,
  };
}

function dropEvent(activeKey: string, overId: string): DragEndEvent {
  return {
    active: { id: activeKey, data: { current: {} } },
    over: { id: overId, data: { current: {} } },
  } as unknown as DragEndEvent;
}

describe("useSprintBoardDragDrop - sprint-slot drop zone", () => {
  beforeEach(() => {
    moveSprint.mockReset().mockResolvedValue({});
    moveTicketSprintCaches.mockReset();
    revalidateMovedSprintLists.mockReset();
    registerPendingMove.mockReset();
    clearPendingMove.mockReset();
    confirmPendingMove.mockReset();
  });

  it("confirms the pending move after a successful drop to another sprint", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    expect(confirmPendingMove).toHaveBeenCalledWith("VPL-1");
  });

  it("registers the moved row as a pending move so it survives revalidation", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    expect(registerPendingMove).toHaveBeenCalledWith(
      expect.objectContaining({ key: "VPL-1" }),
      "140",
      expect.any(Number),
    );
  });

  it("clears the pending move when the drop move fails", async () => {
    moveSprint.mockRejectedValueOnce(new Error("boom"));
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    expect(clearPendingMove).toHaveBeenCalledWith("VPL-1");
  });

  it("optimistically moves the dropped ticket across caches then revalidates the affected lists", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    expect(moveTicketSprintCaches).toHaveBeenCalledWith(
      expect.objectContaining({ key: "VPL-1" }),
      "140",
      true,
    );
    // TO DO ticket into a regular sprint -> bottom, so topKeys is empty (BRDG-370).
    await waitFor(() => expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-1"], targetSprintId: "140", topKeys: [] }));
    // After the move resolves, revalidate the destination + origin lists so the
    // row reappears promptly if the target view was opened mid-move.
    expect(revalidateMovedSprintLists).toHaveBeenCalledWith(["140", "todo"]);
  });

  it("sends an in-flight ticket to the bottom of a regular sprint too (no status exception)", async () => {
    const inProgress = { ...makeTicket("VPL-1", "todo"), jiraStatus: "IN PROGRESS" } as Ticket;
    const deps = makeDeps({ tickets: [inProgress, makeTicket("VPL-2", "todo")], apiTickets: [inProgress, makeTicket("VPL-2", "todo")] });
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    await waitFor(() => expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-1"], targetSprintId: "140", topKeys: [] }));
  });

  it("does not revalidate lists when the move fails (optimistic state is rolled back instead)", async () => {
    moveSprint.mockRejectedValueOnce(new Error("boom"));
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    expect(revalidateMovedSprintLists).not.toHaveBeenCalled();
  });

  it("refreshes the capacity meter after a successful cross-sprint drop", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    await waitFor(() => expect(deps.refreshMeter).toHaveBeenCalled());
  });

  it("does not refresh the capacity meter when the move fails", async () => {
    moveSprint.mockRejectedValueOnce(new Error("boom"));
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    expect(deps.refreshMeter).not.toHaveBeenCalled();
  });

  it("rolls the row back to its origin sprint when the move fails", async () => {
    moveSprint.mockRejectedValueOnce(new Error("boom"));
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    // First call moves to the top of the target, the rollback moves it back to "todo".
    expect(moveTicketSprintCaches).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: "VPL-1" }), "140", true);
    expect(moveTicketSprintCaches).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: "VPL-1" }), "todo");
    expect(deps.showToast).toHaveBeenCalledWith("Failed to move to sprint. Changes reverted.");
  });

  it("ignores a drop onto the active sprint's own slot", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:todo"));
    });

    expect(moveTicketSprintCaches).not.toHaveBeenCalled();
    expect(moveSprint).not.toHaveBeenCalled();
  });
});

describe("useSprintBoardDragDrop - expanded group-header drop (BRDG-452)", () => {
  beforeEach(() => {
    moveSprint.mockReset().mockResolvedValue({});
  });

  function headerDropEvent(activeKey: string, activeSprintId: string, targetSprintId: string): DragEndEvent {
    return {
      active: { id: activeKey, data: { current: { sprintId: activeSprintId } } },
      over: { id: `group-header:${targetSprintId}`, data: { current: { type: "group-zone", sprintId: targetSprintId } } },
    } as unknown as DragEndEvent;
  }

  it("moves the dragged ticket to the sprint whose header it was dropped on", async () => {
    const deps = makeDeps({ isAllView: true, groupBy: "sprint" as const });
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(headerDropEvent("VPL-1", "todo", "140"));
    });

    // Regular sprint header -> whole batch to the bottom (BRDG-370), like the group zone.
    await waitFor(() => expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-1"], targetSprintId: "140", topKeys: [] }));
  });

  it("ignores a drop on the header of the ticket's own sprint", async () => {
    const deps = makeDeps({ isAllView: true, groupBy: "sprint" as const });
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(headerDropEvent("VPL-1", "todo", "todo"));
    });

    expect(moveSprint).not.toHaveBeenCalled();
  });

  it("suppresses the row insert line while hovering a header target", () => {
    const deps = makeDeps({ isAllView: true, groupBy: "sprint" as const });
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    act(() => {
      result.current.handleBoardDragOver({
        active: { id: "VPL-1", data: { current: { sprintId: "todo" } } },
        over: { id: "group-header:140", data: { current: { type: "group-zone", sprintId: "140" } } },
      } as unknown as Parameters<typeof result.current.handleBoardDragOver>[0]);
    });

    expect(result.current.boardOverId).toBeNull();
    // The ghost chip still knows the target sprint.
    expect(result.current.boardDragTargetSprintId).toBe("140");
  });
});

describe("useSprintBoardDragDrop - jiraRankDndEnabled (no longer size-gated, BRDG-347)", () => {
  it("is enabled for a single-sprint rank view regardless of list size", () => {
    const many = Array.from({ length: 200 }, (_, i) => makeTicket(`VPL-${i}`, "todo"));
    const deps = makeDeps({ tickets: many, apiTickets: many });
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));
    expect(result.current.jiraRankDndEnabled).toBe(true);
  });

  it("is disabled inside a saved view or when not sorting by rank", () => {
    const view = renderHook(() => useSprintBoardDragDrop(makeDeps({ activeViewId: "v1" })));
    expect(view.result.current.jiraRankDndEnabled).toBe(false);

    const byBv = renderHook(() => useSprintBoardDragDrop(makeDeps({ sortField: "bv" })));
    expect(byBv.result.current.jiraRankDndEnabled).toBe(false);
  });
});

describe("useSprintBoardDragDrop - drag-start list snapshot (BRDG-405)", () => {
  it("computes the rank direction against the drag-start snapshot, not a list that shifted mid-drag", async () => {
    vi.mocked(jira.rank).mockClear().mockResolvedValue({} as never);

    const startList = [makeTicket("A", "todo"), makeTicket("B", "todo"), makeTicket("C", "todo")];
    const { result, rerender } = renderHook((p: ReturnType<typeof makeDeps>) => useSprintBoardDragDrop(p), {
      initialProps: makeDeps({ tickets: startList, apiTickets: startList }),
    });

    // Drag begins against [A, B, C]: A is ABOVE C.
    act(() => {
      result.current.handleBoardDragStart({ active: { id: "A" } } as unknown as DragStartEvent);
    });

    // A revalidation reorders the live list so A now sits BELOW C; without the
    // snapshot the drag-end math would read the opposite direction.
    const shifted = [makeTicket("C", "todo"), makeTicket("B", "todo"), makeTicket("A", "todo")];
    rerender(makeDeps({ tickets: shifted, apiTickets: shifted }));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("A", "C"));
    });

    // Snapshot direction (A above C, dragged down onto C) => rank AFTER C.
    expect(vi.mocked(jira.rank)).toHaveBeenCalledWith({ issueKeys: ["A"], rankBeforeKey: undefined, rankAfterKey: "C", sprintId: "todo" });
  });
});

describe("useSprintBoardDragDrop - filter-correct reorder (BRDG-347)", () => {
  it("preserves tickets hidden by a filter when reordering two visible rows", async () => {
    // Only VPL-1 and VPL-2 are visible (filtered); VPL-3 is hidden but still in the cache.
    const visible = [makeTicket("VPL-1", "todo"), makeTicket("VPL-2", "todo")];
    const deps = makeDeps({ tickets: visible, apiTickets: visible });
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "VPL-2"));
    });

    // The optimistic reorder must run against the FULL list passed to its updater.
    const reorderCall = (deps.mutateTickets as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === "function",
    );
    expect(reorderCall).toBeDefined();
    const updater = reorderCall![0] as (current: Ticket[]) => Ticket[];
    const fullList = [makeTicket("VPL-1", "todo"), makeTicket("VPL-2", "todo"), makeTicket("VPL-3", "todo")];
    const next = updater(fullList);
    // Hidden VPL-3 is kept; VPL-1 lands just after the visible neighbour VPL-2.
    expect(next.map((t) => t.key)).toEqual(["VPL-2", "VPL-1", "VPL-3"]);
    expect(next.find((t) => t.key === "VPL-3")).toBeDefined();
  });
});
