import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ticket } from "@/types/ticket";
import { useTicketActions } from "./useTicketActions";
import { saveStoryPoints, saveTicketMetadata } from "@/components/sprint-board/sprint-board-utils";
import { apiFetch } from "@/lib/api-client";

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
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ apiTickets, mutateTickets, activeListKey: null, showToast }),
    );
    return { result, mutateTickets, showToast };
  }

  it("flags all targets and posts the reason, then toasts success", async () => {
    toggleFlag.mockResolvedValue({ flagged: true });
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, "blocked by API", new Set(["A-1", "A-2"]));
    });

    expect(toggleFlag).toHaveBeenCalledTimes(2);
    expect(toggleFlag).toHaveBeenCalledWith("A-1", true, "blocked by API");
    expect(toggleFlag).toHaveBeenCalledWith("A-2", true, "blocked by API");
    // Optimistic write
    expect(mutateTickets).toHaveBeenCalled();
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
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleBulkSetFlagged(true, null, new Set(["A-1"]));
    });

    // Optimistic write + revert write
    expect(mutateTickets.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(showToast).toHaveBeenLastCalledWith("Failed to flag 1 ticket");
  });
});

describe("useTicketActions - handleStoryPointsChange readiness transition", () => {
  beforeEach(() => {
    saveStoryPointsMock.mockReset();
    saveStoryPointsMock.mockResolvedValue(true);
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ apiTickets, mutateTickets, activeListKey: null, showToast }),
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

    expect(saveStoryPointsMock).toHaveBeenCalledWith("A-1", 5, null);
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
  });

  function setup() {
    const { result } = renderHook(() =>
      useTicketActions({ apiTickets: [], mutateTickets: vi.fn(), activeListKey: null, showToast: vi.fn() }),
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
  });

  function setup(apiTickets: Ticket[], activeListKey: string | null) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ apiTickets, mutateTickets, activeListKey, showToast }),
    );
    return { result, mutateTickets, showToast };
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
    expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["A-1", "A-2"], targetSprintId: "200", position: "top" });

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

    expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["A-1"], targetSprintId: "__backlog__", position: "top" });
    const destCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=__backlog__");
    expect(destCall).toBeDefined();
    const injected = runGlobalUpdater(destCall!, undefined);
    expect(injected[0].sprintId).toBeUndefined();
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
  });

  // A minimal SWR-mutate stand-in: awaits the data promise (rethrowing so the
  // hook's catch fires) and exposes the optimistic/populate updaters for assertion.
  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn(async (data?: unknown, _opts?: unknown) => {
      if (data && typeof (data as Promise<unknown>).then === "function") {
        await data; // rejects -> mutateTickets rejects -> hook catch runs
      }
    });
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({
        apiTickets,
        mutateTickets: mutateTickets as unknown as Parameters<typeof useTicketActions>[0]["mutateTickets"],
        activeListKey: null,
        showToast,
      }),
    );
    return { result, mutateTickets, showToast };
  }

  const user = { accountId: "acc-real-1", displayName: "Frank van den Nouland", avatarUrl: null };

  it("assigns with the real accountId and optimistically shows the new assignee", async () => {
    assign.mockResolvedValue(undefined);
    const { result, mutateTickets } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleAssigneeChange("A-1", user);
    });

    expect(assign).toHaveBeenCalledWith({ issueKey: "A-1", accountId: "acc-real-1", name: "Frank van den Nouland", avatar: null });

    const opts = mutateTickets.mock.calls[0][1] as {
      optimisticData: (c?: Ticket[]) => Ticket[];
      populateCache: (r: unknown, c?: Ticket[]) => Ticket[];
      revalidate: boolean;
    };
    const current = [makeTicket("A-1", false)];
    expect(opts.revalidate).toBe(false);
    expect(opts.optimisticData(current).find((t) => t.key === "A-1")?.assignee?.name).toBe("Frank van den Nouland");
    expect(opts.populateCache(undefined, current).find((t) => t.key === "A-1")?.assignee?.name).toBe("Frank van den Nouland");
  });

  it("clears the assignee when unassigning (null user)", async () => {
    assign.mockResolvedValue(undefined);
    const { result, mutateTickets } = setup([{ ...makeTicket("A-1", false), assignee: { name: "X", initials: "X", color: "#000" } } as Ticket]);

    await act(async () => {
      await result.current.handleAssigneeChange("A-1", null);
    });

    expect(assign).toHaveBeenCalledWith({ issueKey: "A-1", accountId: null, name: null, avatar: null });
    const opts = mutateTickets.mock.calls[0][1] as { optimisticData: (c?: Ticket[]) => Ticket[] };
    expect(opts.optimisticData([makeTicket("A-1", false)]).find((t) => t.key === "A-1")?.assignee).toBeNull();
  });

  it("toasts a revert message when the assign request fails", async () => {
    assign.mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleAssigneeChange("A-1", user);
    });

    expect(showToast).toHaveBeenCalledWith("Failed to update assignee for A-1. Change reverted.");
  });
});

describe("useTicketActions - handleJiraStatusChange (BRDG-339)", () => {
  const apiFetchMock = vi.mocked(apiFetch);

  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  // SWR-mutate stand-in: awaits the data promise (rethrowing so the hook's
  // catch fires) and exposes the optimistic/populate updaters for assertion.
  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn(async (data?: unknown, _opts?: unknown) => {
      if (data && typeof (data as Promise<unknown>).then === "function") {
        await data;
      }
    });
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({
        apiTickets,
        mutateTickets: mutateTickets as unknown as Parameters<typeof useTicketActions>[0]["mutateTickets"],
        activeListKey: null,
        showToast,
      }),
    );
    return { result, mutateTickets, showToast };
  }

  it("optimistically shows the new status and locks it in via populateCache", async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const { result, mutateTickets } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleJiraStatusChange("A-1", "DONE");
    });

    expect(apiFetchMock).toHaveBeenCalledWith("/api/tickets/A-1/status", { method: "PUT", body: { status: "DONE" } });

    const opts = mutateTickets.mock.calls[0][1] as {
      optimisticData: (c?: Ticket[]) => Ticket[];
      populateCache: (r: unknown, c?: Ticket[]) => Ticket[];
      revalidate: boolean;
    };
    const current = [makeTicket("A-1", false)];
    // revalidate:false is what makes SWR discard the focus revalidation that
    // races the PUT and would otherwise revert the row to a stale Jira read.
    expect(opts.revalidate).toBe(false);
    expect(opts.optimisticData(current).find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
    expect(opts.populateCache(undefined, current).find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
  });

  it("toasts a revert message when the status request fails", async () => {
    apiFetchMock.mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);

    await act(async () => {
      await result.current.handleJiraStatusChange("A-1", "DONE");
    });

    expect(showToast).toHaveBeenCalledWith("Failed to update status for A-1. Change reverted.");
  });
});

describe("useTicketActions - handleBulkSetStatus (BRDG-339)", () => {
  const apiFetchMock = vi.mocked(apiFetch);

  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn(async (data?: unknown, _opts?: unknown) => {
      if (data && typeof (data as Promise<unknown>).then === "function") {
        await data;
      }
    });
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({
        apiTickets,
        mutateTickets: mutateTickets as unknown as Parameters<typeof useTicketActions>[0]["mutateTickets"],
        activeListKey: null,
        showToast,
      }),
    );
    return { result, mutateTickets, showToast };
  }

  it("optimistically sets the status on all checked tickets and toasts success", async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false), makeTicket("A-3", false)]);

    await act(async () => {
      await result.current.handleBulkSetStatus("DONE", new Set(["A-1", "A-2"]));
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    const opts = mutateTickets.mock.calls[0][1] as {
      optimisticData: (c?: Ticket[]) => Ticket[];
      revalidate: boolean;
    };
    const current = [makeTicket("A-1", false), makeTicket("A-2", false), makeTicket("A-3", false)];
    expect(opts.revalidate).toBe(false);
    const optimistic = opts.optimisticData(current);
    expect(optimistic.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
    expect(optimistic.find((t) => t.key === "A-2")?.jiraStatus).toBe("DONE");
    expect(optimistic.find((t) => t.key === "A-3")?.jiraStatus).toBe("TO DO"); // unchecked, untouched
    expect(showToast).toHaveBeenLastCalledWith("Status set to DONE for 2 tickets");
  });

  it("keeps the previous status on rows whose PUT rejected and toasts the failure count", async () => {
    // A-1 succeeds, A-2 fails.
    apiFetchMock.mockImplementation((url: string) =>
      url.includes("A-2") ? Promise.reject(new Error("boom")) : Promise.resolve(undefined),
    );
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);

    await act(async () => {
      await result.current.handleBulkSetStatus("DONE", new Set(["A-1", "A-2"]));
    });

    const opts = mutateTickets.mock.calls[0][1] as {
      populateCache: (failedKeys: Set<string>, c?: Ticket[]) => Ticket[];
    };
    const current = [makeTicket("A-1", false), makeTicket("A-2", false)];
    const settled = opts.populateCache(new Set(["A-2"]), current);
    expect(settled.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
    expect(settled.find((t) => t.key === "A-2")?.jiraStatus).toBe("TO DO"); // reverted
    expect(showToast).toHaveBeenLastCalledWith("Failed to update status for 1 ticket");
  });
});

describe("useTicketActions - syncFromApiTickets reconciliation (BRDG-334)", () => {
  const saveTicketMetadataMock = vi.mocked(saveTicketMetadata);

  beforeEach(() => {
    saveTicketMetadataMock.mockReset();
    saveTicketMetadataMock.mockResolvedValue(true);
  });

  function setup(apiTickets: Ticket[]) {
    const mutateTickets = vi.fn();
    const showToast = vi.fn();
    const { result } = renderHook(() =>
      useTicketActions({ apiTickets, mutateTickets, activeListKey: null, showToast }),
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
