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
vi.mock("@/lib/ticket-cache", () => ({
  moveTicketSprintCaches: (...a: unknown[]) => moveTicketSprintCaches(...a),
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
    sortField: "rank" as const,
    activeViewId: null,
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
  });

  it("optimistically moves the dropped ticket across caches without a reverting revalidation", async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    expect(moveTicketSprintCaches).toHaveBeenCalledWith(
      expect.objectContaining({ key: "VPL-1" }),
      "140",
    );
    await waitFor(() => expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-1"], targetSprintId: "140" }));
    // The bug being fixed: no list revalidation after the move, so the row stays gone.
    expect(deps.mutateTickets).not.toHaveBeenCalled();
  });

  it("rolls the row back to its origin sprint when the move fails", async () => {
    moveSprint.mockRejectedValueOnce(new Error("boom"));
    const deps = makeDeps();
    const { result } = renderHook(() => useSprintBoardDragDrop(deps));

    await act(async () => {
      await result.current.handleBoardDragEnd(dropEvent("VPL-1", "sprint-slot:140"));
    });

    // First call moves to the target, the rollback moves it back to "todo".
    expect(moveTicketSprintCaches).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: "VPL-1" }), "140");
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
