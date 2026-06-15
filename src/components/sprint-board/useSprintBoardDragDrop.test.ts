import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
import { useSprintBoardDragDrop } from "./useSprintBoardDragDrop";
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
vi.mock("@/components/sprint-board/pendingSprintMoves", () => ({
  registerPendingMove: (...a: unknown[]) => registerPendingMove(...a),
  clearPendingMove: (...a: unknown[]) => clearPendingMove(...a),
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
    await waitFor(() => expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-1"], targetSprintId: "140", position: "top" }));
    // After the move resolves, revalidate the destination + origin lists so the
    // row reappears promptly if the target view was opened mid-move.
    expect(revalidateMovedSprintLists).toHaveBeenCalledWith(["140", "todo"]);
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
