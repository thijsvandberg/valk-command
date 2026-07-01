import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ticket } from "@/types/ticket";
import { useTicketActions } from "./useTicketActions";
import { makeBoardAdapter } from "@/components/sprint-board/row-actions/adapter";
import { saveStoryPoints, saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { apiFetch } from "@/lib/api-client";
import {
  applyPendingEdits,
  hasPendingEdit,
  __getPendingEdits,
  __resetPendingEdits,
} from "@/components/sprint-board/pendingTicketEdits";

const toggleFlag = vi.fn();
const moveSprint = vi.fn();
const assign = vi.fn();
const globalMutate = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
  jira: {
    moveSprint: (...args: unknown[]) => moveSprint(...args),
    assign: (...args: unknown[]) => assign(...args),
  },
  tickets: { toggleFlag: (...args: unknown[]) => toggleFlag(...args) },
}));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  saveTicketMetadata: vi.fn(),
  saveStoryPoints: vi.fn(),
}));

const saveStoryPointsMock = vi.mocked(saveStoryPoints);
vi.mock("swr", () => ({
  mutate: (...args: unknown[]) => globalMutate(...args),
}));
vi.mock("@/components/sprint-board/pendingSprintMoves", () => ({
  registerPendingMove: vi.fn(),
  clearPendingMove: vi.fn(),
  confirmPendingMove: vi.fn(),
}));

function makeTicket(key: string, flagged: boolean, sprintId?: string): Ticket {
  return {
    key, title: key, type: "story", epicKey: null, flagged,
    jiraStatus: "TO DO", storyPoints: null, businessValue: null,
    assignee: null, epic: null, sprintId, qualityScore: null,
    readiness: null, poStatus: "Draft", editState: "clean", notes: "",
  } as Ticket;
}

describe("useTicketActions - handleStoryPointsChange readiness transition", () => {
  beforeEach(() => {
    saveStoryPointsMock.mockReset();
    saveStoryPointsMock.mockResolvedValue(true);
    __resetPendingEdits();
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter(apiTickets, mutateTickets, null, {}), showToast }),
    );
    // Seed the optimistic readiness map from the API tickets, as the board does.
    act(() => result.current.syncFromApiTickets(apiTickets));
    return { result };
  }

  function refineReady(key: string): Ticket {
    return { ...makeTicket(key, false), readiness: "ready_to_refine" } as Ticket;
  }

  it("advances a Ready-to-Refine ticket to Ready-for-Development when SP is set", async () => {
    const { result } = setup([refineReady("A-1")]);

    await act(async () => {
      result.current.handleStoryPointsChange("A-1", 5);
    });

    expect(saveStoryPointsMock).toHaveBeenCalledWith("A-1", 5, null, { patchList: false });
    expect(result.current.readinessMap["A-1"]).toBeNull();
  });

  it("treats '-' (0) as an estimate and advances readiness", async () => {
    const { result } = setup([refineReady("A-1")]);

    await act(async () => {
      result.current.handleStoryPointsChange("A-1", 0);
    });

    expect(result.current.readinessMap["A-1"]).toBeNull();
  });

  it("leaves a non-Ready-to-Refine ticket's readiness untouched", async () => {
    const drafting = { ...makeTicket("A-1", false), readiness: "drafting" } as Ticket;
    const { result } = setup([drafting]);

    await act(async () => {
      result.current.handleStoryPointsChange("A-1", 3);
    });

    expect(result.current.readinessMap["A-1"]).toBe("drafting");
  });

  it("reverts the optimistic readiness when the save fails", async () => {
    saveStoryPointsMock.mockResolvedValue(false);
    const { result } = setup([refineReady("A-1")]);

    await act(async () => {
      result.current.handleStoryPointsChange("A-1", 5);
    });

    expect(result.current.readinessMap["A-1"]).toBe("ready_to_refine");
  });
});

describe("useTicketActions - capacity meter refresh on estimate change", () => {
  const saveTicketMetadataMock = vi.mocked(saveTicketMetadata);
  beforeEach(() => {
    globalMutate.mockReset();
    saveStoryPointsMock.mockReset().mockResolvedValue(true);
    saveTicketMetadataMock.mockReset().mockResolvedValue(true);
    __resetPendingEdits();
  });

  function setup() {
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter([], vi.fn(), null, {}), showToast: vi.fn() }),
    );
    return { result };
  }

  it("refreshes the meter after a story-points change", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleStoryPointsChange("A-1", 5); });
    expect(globalMutate).toHaveBeenCalledWith("/api/sprints/used-points");
  });

  it("refreshes the meter after a guestimation change", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleGuestimationChange("A-1", 3); });
    expect(globalMutate).toHaveBeenCalledWith("/api/sprints/used-points");
  });

  it("does not refresh the meter when the story-points save fails", async () => {
    saveStoryPointsMock.mockResolvedValue(false);
    const { result } = setup();
    await act(async () => { result.current.handleStoryPointsChange("A-1", 5); });
    expect(globalMutate).not.toHaveBeenCalledWith("/api/sprints/used-points");
  });
});

// A score edit rides the pendingTicketEdits overlay, which self-clears after a 30s
// TTL. The overlay only hands off cleanly once the loaded list reflects the value,
// but nothing refetched the list (the All view has no background poll), so the value
// blinked out at ~30s and reappeared on a later focus/poll. The confirmed save must
// revalidate the list so the overlay self-heals off fresh data (BRDG-455).
describe("useTicketActions - list revalidation on confirmed score save", () => {
  const saveTicketMetadataMock = vi.mocked(saveTicketMetadata);
  const listKey = "/api/tickets?sprintId=200";
  beforeEach(() => {
    globalMutate.mockReset();
    saveStoryPointsMock.mockReset().mockResolvedValue(true);
    saveTicketMetadataMock.mockReset().mockResolvedValue(true);
    __resetPendingEdits();
  });

  function setup() {
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter([], vi.fn(), listKey, {}), showToast: vi.fn() }),
    );
    return { result };
  }

  it("revalidates the list after a guestimation change", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleGuestimationChange("A-1", 3); });
    expect(globalMutate).toHaveBeenCalledWith(listKey);
  });

  it("revalidates the list after a business-value change", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleBusinessValueChange("A-1", 5); });
    expect(globalMutate).toHaveBeenCalledWith(listKey);
  });

  it("revalidates the list after a story-points change", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleStoryPointsChange("A-1", 8); });
    expect(globalMutate).toHaveBeenCalledWith(listKey);
  });

  it("does not revalidate the list when the save fails", async () => {
    saveTicketMetadataMock.mockResolvedValue(false);
    const { result } = setup();
    await act(async () => { result.current.handleGuestimationChange("A-1", 3); });
    expect(globalMutate).not.toHaveBeenCalledWith(listKey);
  });
});

describe("useTicketActions - handleAssigneeChange", () => {
  beforeEach(() => {
    assign.mockReset();
    __resetPendingEdits();
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter(apiTickets, mutateTickets, null, {}), showToast }),
    );
    return { result, mutateTickets, showToast };
  }

  const user = { accountId: "acc-real-1", displayName: "Frank van den Nouland", avatarUrl: null };

  it("assigns with the real accountId and optimistically shows the new assignee via the overlay", async () => {
    assign.mockResolvedValue(undefined);
    const { result } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleAssigneeChange("A-1", user);
    });

    expect(assign).toHaveBeenCalledWith({ issueKey: "A-1", accountId: "acc-real-1", name: "Frank van den Nouland", avatar: null });

    const overlaid = applyPendingEdits([makeTicket("A-1", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.find((t) => t.key === "A-1")?.assignee?.name).toBe("Frank van den Nouland");
  });

  it("clears the assignee when unassigning (null user)", async () => {
    assign.mockResolvedValue(undefined);
    const seeded = { ...makeTicket("A-1", false), assignee: { name: "X", initials: "X", color: "#000" } } as Ticket;
    const { result } = setup([seeded]);

    await act(async () => {
      await result.current.handleAssigneeChange("A-1", null);
    });

    expect(assign).toHaveBeenCalledWith({ issueKey: "A-1", accountId: null, name: null, avatar: null });
    const overlaid = applyPendingEdits([seeded], __getPendingEdits(), Date.now())!;
    expect(overlaid.find((t) => t.key === "A-1")?.assignee).toBeNull();
  });

  it("clears the overlay and toasts a revert message when the assign request fails", async () => {
    assign.mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleAssigneeChange("A-1", user);
    });

    expect(hasPendingEdit("A-1", "assignee")).toBe(false);
    expect(showToast).toHaveBeenCalledWith("Failed to update assignee for A-1. Change reverted.");
  });
});

describe("useTicketActions - handleJiraStatusChange (BRDG-357)", () => {
  const apiFetchMock = vi.mocked(apiFetch);

  beforeEach(() => {
    apiFetchMock.mockReset();
    __resetPendingEdits();
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter(apiTickets, mutateTickets, null, {}), showToast }),
    );
    return { result, mutateTickets, showToast };
  }

  it("registers a status overlay that survives a stale refetch, and confirms it on success", async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const { result } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleJiraStatusChange("A-1", "DONE");
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/api/tickets/A-1/status", { method: "PUT", body: { status: "DONE" } });

    // A refetch that still carries the pre-write status ("TO DO") must not win:
    // the overlay re-applies "DONE" on top of it. This is the core anti-snap-back guarantee.
    const staleRefetch = [makeTicket("A-1", false)]; // jiraStatus: "TO DO"
    const overlaid = applyPendingEdits(staleRefetch, __getPendingEdits(), Date.now())!;
    expect(overlaid.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
    expect(hasPendingEdit("A-1", "jiraStatus")).toBe(true);
  });

  it("clears the overlay and toasts a revert message when the status request fails", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleJiraStatusChange("A-1", "DONE");
    });

    expect(hasPendingEdit("A-1", "jiraStatus")).toBe(false);
    expect(showToast).toHaveBeenCalledWith("Failed to update status for A-1. Change reverted.");
  });
});

describe("useTicketActions - syncFromApiTickets reconciliation (BRDG-334)", () => {
  const saveTicketMetadataMock = vi.mocked(saveTicketMetadata);

  beforeEach(() => {
    saveTicketMetadataMock.mockReset();
    saveTicketMetadataMock.mockResolvedValue(true);
    __resetPendingEdits();
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter(apiTickets, mutateTickets, null, {}), showToast }),
    );
    return { result };
  }

  it("follows fresh API data so edits made on other surfaces show up", () => {
    const t = { ...makeTicket("A-1", false), readiness: "drafting" } as Ticket;
    const { result } = setup([t]);
    act(() => result.current.syncFromApiTickets([t]));
    expect(result.current.readinessMap["A-1"]).toBe("drafting");
    expect(result.current.poStatuses["A-1"]).toBe("Draft");

    // The same ticket comes back changed (e.g. edited on the ticket detail page).
    const updated = { ...t, readiness: "ready_to_refine", poStatus: "Ready" } as Ticket;
    act(() => result.current.syncFromApiTickets([updated]));

    expect(result.current.readinessMap["A-1"]).toBe("ready_to_refine");
    expect(result.current.poStatuses["A-1"]).toBe("Ready");
  });

  it("does not clobber an optimistic value while its save is in flight", async () => {
    let resolveSave: ((ok: boolean) => void) | undefined;
    saveTicketMetadataMock.mockImplementation(() => new Promise((res) => { resolveSave = res; }));
    const t = { ...makeTicket("A-1", false), readiness: "drafting" } as Ticket;
    const { result } = setup([t]);
    act(() => result.current.syncFromApiTickets([t]));

    act(() => { result.current.handleReadinessChange("A-1", "on_hold"); });
    // A racing revalidation still carrying the old readiness must not revert the pill.
    act(() => result.current.syncFromApiTickets([t]));
    expect(result.current.readinessMap["A-1"]).toBe("on_hold");

    await act(async () => { resolveSave?.(true); });
    // After the save resolves, fresh data flows through again.
    act(() => result.current.syncFromApiTickets([{ ...t, readiness: "on_hold" } as Ticket]));
    expect(result.current.readinessMap["A-1"]).toBe("on_hold");
  });
});

// BRDG-383: board-row edits own their display via the pendingTicketEdits overlay, so the
// save helpers must NOT also patch the SWR list cache (that defeats the board's self-heal
// and causes the value to snap back). Every board overlay handler must opt out with
// { patchList: false }.
describe("useTicketActions - board edits opt out of the list-cache patch (BRDG-383)", () => {
  const saveTicketMetadataMock = vi.mocked(saveTicketMetadata);

  beforeEach(() => {
    saveTicketMetadataMock.mockReset().mockResolvedValue(true);
    saveStoryPointsMock.mockReset().mockResolvedValue(true);
    __resetPendingEdits();
  });

  const LIST_KEY = "/api/tickets?sprintId=42";

  function setup() {
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter([], vi.fn(), LIST_KEY, {}), showToast: vi.fn() }),
    );
    return { result };
  }

  it("business value passes patchList: false", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleBusinessValueChange("A-1", 5); });
    expect(saveTicketMetadataMock).toHaveBeenCalledWith("A-1", { businessValue: 5 }, LIST_KEY, { patchList: false });
  });

  it("guestimation passes patchList: false", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleGuestimationChange("A-1", 3); });
    expect(saveTicketMetadataMock).toHaveBeenCalledWith("A-1", { guestimation: 3 }, LIST_KEY, { patchList: false });
  });

  it("PO status passes patchList: false", async () => {
    const { result } = setup();
    await act(async () => { result.current.handlePoStatusChange("A-1", "Ready"); });
    expect(saveTicketMetadataMock).toHaveBeenCalledWith("A-1", { poStatus: "Ready" }, LIST_KEY, { patchList: false });
  });

  it("readiness passes patchList: false", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleReadinessChange("A-1", "on_hold"); });
    expect(saveTicketMetadataMock).toHaveBeenCalledWith("A-1", { readiness: "on_hold" }, LIST_KEY, { patchList: false });
  });

  it("story points passes patchList: false", async () => {
    const { result } = setup();
    await act(async () => { result.current.handleStoryPointsChange("A-1", 8); });
    expect(saveStoryPointsMock).toHaveBeenCalledWith("A-1", 8, LIST_KEY, { patchList: false });
  });
});
