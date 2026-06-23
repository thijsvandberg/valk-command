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

describe("useTicketActions - handleBulkSetFlagged", () => {
  beforeEach(() => {
    toggleFlag.mockReset();
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

  it("flags all targets and posts the reason, then toasts success", async () => {
    toggleFlag.mockResolvedValue({ flagged: true });
    const { result, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, "blocked by API", new Set(["A-1", "A-2"]));
    });

    expect(toggleFlag).toHaveBeenCalledTimes(2);
    expect(toggleFlag).toHaveBeenCalledWith("A-1", true, "blocked by API");
    expect(toggleFlag).toHaveBeenCalledWith("A-2", true, "blocked by API");
    // Optimistic overlay applied to both rows and confirmed on success.
    const overlaid = applyPendingEdits([makeTicket("A-1", false), makeTicket("A-2", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.every((t) => t.flagged)).toBe(true);
    expect(showToast).toHaveBeenLastCalledWith("Flagged 2 tickets");
  });

  it("passes undefined reason when none is given", async () => {
    toggleFlag.mockResolvedValue({ flagged: true });
    const { result } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, null, new Set(["A-1"]));
    });

    expect(toggleFlag).toHaveBeenCalledWith("A-1", true, undefined);
  });

  it("unflags and toasts the singular success message", async () => {
    toggleFlag.mockResolvedValue({ flagged: false });
    const { result, showToast } = setup([makeTicket("A-1", true)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(false, null, new Set(["A-1"]));
    });

    expect(toggleFlag).toHaveBeenCalledWith("A-1", false, undefined);
    expect(showToast).toHaveBeenLastCalledWith("Unflagged 1 ticket");
  });

  it("reverts and reports failure when a request rejects", async () => {
    toggleFlag.mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, null, new Set(["A-1"]));
    });

    // The overlay edit is cleared, so the row falls back to server data.
    expect(hasPendingEdit("A-1", "flagged")).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith("Failed to flag 1 ticket");
  });
});

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

describe("useTicketActions - handleBulkMoveSprint", () => {
  beforeEach(() => {
    moveSprint.mockReset();
    globalMutate.mockReset();
    __resetPendingEdits();
  });

  // "200" is a regular numbered sprint, so by the BRDG-370 placement rule a TO DO
  // ticket lands at the bottom (topKeys excludes it); in-flight tickets land at top.
  function setup(apiTickets: Ticket[], activeListKey: string | null, sprintNameMap: Record<string, string> = { "200": "BT: 200", "300": "BT: 300" }) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ adapter: makeBoardAdapter(apiTickets, mutateTickets, activeListKey, sprintNameMap), showToast }),
    );
    return { result, mutateTickets, showToast };
  }

  function makeTicketWithStatus(key: string, status: Ticket["jiraStatus"], sprintId?: string): Ticket {
    return { ...makeTicket(key, false, sprintId), jiraStatus: status };
  }

  // The cache updater is the first arg to a (key, updater, opts) mutate call.
  function runGlobalUpdater(call: unknown[], current: Ticket[] | undefined): Ticket[] {
    const updater = call[1] as (c: Ticket[] | undefined) => Ticket[];
    return updater(current);
  }

  it("removes moved tickets from a per-sprint source and injects them into the destination", async () => {
    moveSprint.mockResolvedValue(undefined);
    const source = [makeTicket("A-1", false, "100"), makeTicket("A-2", false, "100"), makeTicket("A-3", false, "100")];
    const { result } = setup(source, "/api/tickets?sprintId=100");

    let outcome: { ok: boolean; count: number } | undefined;
    await act(async () => {
      outcome = await result.current.handleBulkMoveSprint("200", new Set(["A-1", "A-2"]));
    });

    expect(outcome).toEqual({ ok: true, count: 2 });
    // Regular sprint + TO DO tickets -> bottom, so no keys are sent as topKeys.
    expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["A-1", "A-2"], targetSprintId: "200", topKeys: [] });

    // Destination injection into the 200 key, with the new sprintId.
    const destCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=200");
    expect(destCall).toBeDefined();
    const injected = runGlobalUpdater(destCall!, undefined);
    expect(injected.map((t) => t.key)).toEqual(["A-1", "A-2"]);
    expect(injected.every((t) => t.sprintId === "200")).toBe(true);
  });

  it("removes moved tickets from the source list cache", async () => {
    moveSprint.mockResolvedValue(undefined);
    const source = [makeTicket("A-1", false, "100"), makeTicket("A-2", false, "100"), makeTicket("A-3", false, "100")];
    const { result, mutateTickets } = setup(source, "/api/tickets?sprintId=100");

    await act(async () => {
      await result.current.handleBulkMoveSprint("200", new Set(["A-1", "A-2"]));
    });

    const updater = mutateTickets.mock.calls[0][0] as (d: Ticket[]) => Ticket[];
    expect(updater(source).map((t) => t.key)).toEqual(["A-3"]);
  });

  it("updates sprintId in place (no removal) in the All view", async () => {
    moveSprint.mockResolvedValue(undefined);
    const all = [makeTicket("A-1", false, "100"), makeTicket("A-2", false, "300")];
    const { result, mutateTickets } = setup(all, "/api/tickets");

    await act(async () => {
      await result.current.handleBulkMoveSprint("200", new Set(["A-1"]));
    });

    const updater = mutateTickets.mock.calls[0][0] as (d: Ticket[]) => Ticket[];
    const next = updater(all);
    expect(next.map((t) => t.key)).toEqual(["A-1", "A-2"]); // nothing removed
    expect(next.find((t) => t.key === "A-1")?.sprintId).toBe("200");
    expect(next.find((t) => t.key === "A-2")?.sprintId).toBe("300"); // untouched
  });

  it("targets the backlog key and clears sprintId when moving to backlog", async () => {
    moveSprint.mockResolvedValue(undefined);
    const source = [makeTicket("A-1", false, "100")];
    const { result } = setup(source, "/api/tickets?sprintId=100");

    await act(async () => {
      await result.current.handleBulkMoveSprint("__backlog__", new Set(["A-1"]));
    });

    // Backlog destination -> everything lands at the top (all keys in topKeys).
    expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["A-1"], targetSprintId: "__backlog__", topKeys: ["A-1"] });
    const destCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=__backlog__");
    expect(destCall).toBeDefined();
    const injected = runGlobalUpdater(destCall!, undefined);
    expect(injected[0].sprintId).toBeUndefined();
  });

  it("splits the batch into a regular sprint: in-flight tickets go top, the rest stay bottom", async () => {
    moveSprint.mockResolvedValue(undefined);
    const source = [
      makeTicketWithStatus("A-1", "TO DO", "100"),
      makeTicketWithStatus("A-2", "IN PROGRESS", "100"),
      makeTicketWithStatus("A-3", "TEST", "100"),
    ];
    const { result } = setup(source, "/api/tickets?sprintId=100");

    await act(async () => {
      await result.current.handleBulkMoveSprint("200", new Set(["A-1", "A-2", "A-3"]));
    });

    expect(moveSprint).toHaveBeenCalledWith({
      issueKeys: ["A-1", "A-2", "A-3"],
      targetSprintId: "200",
      topKeys: ["A-2", "A-3"],
    });
  });

  it("does not duplicate a ticket already present in the destination cache", async () => {
    moveSprint.mockResolvedValue(undefined);
    const source = [makeTicket("A-1", false, "100")];
    const { result } = setup(source, "/api/tickets?sprintId=100");

    await act(async () => {
      await result.current.handleBulkMoveSprint("200", new Set(["A-1"]));
    });

    const destCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=200");
    const existing = [makeTicket("A-1", false, "200")];
    const merged = runGlobalUpdater(destCall!, existing);
    expect(merged.filter((t) => t.key === "A-1")).toHaveLength(1);
  });

  it("writes no optimistic cache state when the move fails", async () => {
    moveSprint.mockRejectedValue(new Error("boom"));
    const source = [makeTicket("A-1", false, "100")];
    const { result, mutateTickets } = setup(source, "/api/tickets?sprintId=100");

    let outcome: { ok: boolean; count: number } | undefined;
    await act(async () => {
      outcome = await result.current.handleBulkMoveSprint("200", new Set(["A-1"]));
    });

    expect(outcome).toEqual({ ok: false, count: 1 });
    expect(mutateTickets).not.toHaveBeenCalled();
    expect(globalMutate).not.toHaveBeenCalled();
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

describe("useTicketActions - handleBulkSetStatus (BRDG-357)", () => {
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

  it("overlays the status on all checked tickets and toasts success", async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const { result, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false), makeTicket("A-3", false)]);

    await act(async () => {
      await result.current.handleBulkSetStatus("DONE", new Set(["A-1", "A-2"]));
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    const overlaid = applyPendingEdits(
      [makeTicket("A-1", false), makeTicket("A-2", false), makeTicket("A-3", false)],
      __getPendingEdits(),
      Date.now(),
    )!;
    expect(overlaid.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
    expect(overlaid.find((t) => t.key === "A-2")?.jiraStatus).toBe("DONE");
    expect(overlaid.find((t) => t.key === "A-3")?.jiraStatus).toBe("TO DO"); // unchecked, untouched
    expect(showToast).toHaveBeenLastCalledWith("Status set to DONE for 2 tickets");
  });

  it("clears the overlay on rows whose PUT rejected and toasts the failure count", async () => {
    // A-1 succeeds, A-2 fails.
    apiFetchMock.mockImplementation((url: string) =>
      url.includes("A-2") ? Promise.reject(new Error("boom")) : Promise.resolve(undefined),
    );
    const { result, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);

    await act(async () => {
      await result.current.handleBulkSetStatus("DONE", new Set(["A-1", "A-2"]));
    });

    const overlaid = applyPendingEdits([makeTicket("A-1", false), makeTicket("A-2", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE"); // kept
    expect(hasPendingEdit("A-2", "jiraStatus")).toBe(false); // failed -> reverted to server data
    expect(overlaid.find((t) => t.key === "A-2")?.jiraStatus).toBe("TO DO");
    expect(showToast).toHaveBeenLastCalledWith("Failed to update status for 1 ticket");
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

describe("useTicketActions - handleBulkSetEpic", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
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

  it("optimistically overlays the epic name + key on every target so the board chip shows at once", async () => {
    vi.mocked(apiFetch).mockResolvedValue({} as never);
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);

    await act(async () => {
      await result.current.handleBulkSetEpic("VPL-100", "Checkout", new Set(["A-1", "A-2"]));
    });

    expect(apiFetch).toHaveBeenCalledWith("/api/tickets/A-1", { method: "PATCH", body: { epicKey: "VPL-100" } });
    expect(apiFetch).toHaveBeenCalledWith("/api/tickets/A-2", { method: "PATCH", body: { epicKey: "VPL-100" } });
    // The row renders the chip from both fields, so both must be overlaid.
    const overlaid = applyPendingEdits([makeTicket("A-1", false), makeTicket("A-2", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.every((t) => t.epic === "Checkout" && t.epicKey === "VPL-100")).toBe(true);
    expect(mutateTickets).toHaveBeenCalled();
    expect(showToast).toHaveBeenLastCalledWith("Epic updated for 2 tickets");
  });

  it("clears the overlay and reports failure when a request rejects", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleBulkSetEpic("VPL-100", "Checkout", new Set(["A-1"]));
    });

    expect(hasPendingEdit("A-1", "epic")).toBe(false);
    expect(hasPendingEdit("A-1", "epicKey")).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith("Failed to update epic for 1 ticket");
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
