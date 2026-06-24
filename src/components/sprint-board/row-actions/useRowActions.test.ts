import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ticket } from "@/types/ticket";
import { useRowActions } from "./useRowActions";
import { makeBoardAdapter, makeBoardDispatchAdapter } from "./adapter";
import {
  applyPendingEdits,
  hasPendingEdit,
  __getPendingEdits,
  __resetPendingEdits,
} from "@/components/sprint-board/pendingTicketEdits";

// BRDG-374: the shared bulk dispatch. Exercised through the BOARD dispatch adapter,
// so these tests also cover the board's overlay optimism (pendingTicketEdits +
// pendingSprintMoves) and the BRDG-271 destination-cache injection.

const apiFetch = vi.fn();
const moveSprint = vi.fn();
const assign = vi.fn();
const updateMetadata = vi.fn();
const updateEpic = vi.fn();
const updateLabels = vi.fn();
const toggleFlag = vi.fn();
const globalMutate = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  jira: {
    moveSprint: (...args: unknown[]) => moveSprint(...args),
    assign: (...args: unknown[]) => assign(...args),
  },
  tickets: {
    updateMetadata: (...args: unknown[]) => updateMetadata(...args),
    updateEpic: (...args: unknown[]) => updateEpic(...args),
    updateLabels: (...args: unknown[]) => updateLabels(...args),
    toggleFlag: (...args: unknown[]) => toggleFlag(...args),
  },
}));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  bulkReviewStories: vi.fn(),
  bulkGenerateSubtasks: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
}));
vi.mock("swr", () => ({ mutate: (...args: unknown[]) => globalMutate(...args) }));
vi.mock("@/components/sprint-board/pendingSprintMoves", () => ({
  registerPendingMove: vi.fn(),
  clearPendingMove: vi.fn(),
  confirmPendingMove: vi.fn(),
}));

function makeTicket(key: string, flagged: boolean, sprintId?: string, status: Ticket["jiraStatus"] = "TO DO"): Ticket {
  return {
    key, title: key, type: "story", epicKey: null, flagged,
    jiraStatus: status, storyPoints: null, businessValue: null,
    assignee: null, epic: null, sprintId, qualityScore: null,
    readiness: null, poStatus: "Draft", editState: "clean", notes: "",
  } as Ticket;
}

function setup(apiTickets: Ticket[], activeListKey: string | null = null, sprintNameMap: Record<string, string> = { "200": "BT: 200", "300": "BT: 300" }) {
  const mutateTickets = vi.fn();
  const showToast = vi.fn();
  const setReadinessMap = vi.fn();
  const base = makeBoardAdapter(apiTickets, mutateTickets, activeListKey, sprintNameMap);
  const adapter = makeBoardDispatchAdapter(base, { setReadinessMap, prevRef: { current: {} } });
  const { result } = renderHook(() =>
    useRowActions({
      adapter,
      selectedKeys: new Set<string>(),
      sprints: [],
      pinnedSprintIds: [],
      backlogTargetName: "BT: Backlog",
      showToast,
      flagSource: "ticket",
    }),
  );
  return { result, mutateTickets, showToast, setReadinessMap };
}

// The destination-cache updater is the second arg of a (key, updater, opts) mutate call.
function runGlobalUpdater(call: unknown[], current: Ticket[] | undefined): Ticket[] {
  const updater = call[1] as (c: Ticket[] | undefined) => Ticket[];
  return updater(current);
}

describe("useRowActions - bulkSetFlagged", () => {
  beforeEach(() => { toggleFlag.mockReset().mockResolvedValue({}); __resetPendingEdits(); });

  it("flags all targets and posts the reason, then toasts success", async () => {
    const { result, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);
    await act(async () => { await result.current.bulkSetFlagged(true, "blocked by API", new Set(["A-1", "A-2"])); });

    expect(toggleFlag).toHaveBeenCalledWith("A-1", true, "blocked by API");
    expect(toggleFlag).toHaveBeenCalledWith("A-2", true, "blocked by API");
    const overlaid = applyPendingEdits([makeTicket("A-1", false), makeTicket("A-2", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.every((t) => t.flagged)).toBe(true);
    expect(showToast).toHaveBeenLastCalledWith("Flagged 2 issues");
  });

  it("passes undefined reason when none is given", async () => {
    const { result } = setup([makeTicket("A-1", false)]);
    await act(async () => { await result.current.bulkSetFlagged(true, null, new Set(["A-1"])); });
    expect(toggleFlag).toHaveBeenCalledWith("A-1", true, undefined);
  });

  it("unflags and toasts the singular success message", async () => {
    const { result, showToast } = setup([makeTicket("A-1", true)]);
    await act(async () => { await result.current.bulkSetFlagged(false, null, new Set(["A-1"])); });
    expect(toggleFlag).toHaveBeenCalledWith("A-1", false, undefined);
    expect(showToast).toHaveBeenLastCalledWith("Unflagged 1 issue");
  });

  it("reverts and reports failure when a request rejects", async () => {
    toggleFlag.mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);
    await act(async () => { await result.current.bulkSetFlagged(true, null, new Set(["A-1"])); });
    expect(hasPendingEdit("A-1", "flagged")).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith("Failed for 1 issue");
  });
});

describe("useRowActions - bulkSetStatus", () => {
  beforeEach(() => { apiFetch.mockReset(); __resetPendingEdits(); });

  it("overlays the status on all checked tickets and toasts success", async () => {
    apiFetch.mockResolvedValue(undefined);
    const { result, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false), makeTicket("A-3", false)]);
    await act(async () => { await result.current.bulkSetStatus("DONE", new Set(["A-1", "A-2"])); });

    expect(apiFetch).toHaveBeenCalledWith("/api/tickets/A-1/status", { method: "PUT", body: { status: "DONE" } });
    const overlaid = applyPendingEdits([makeTicket("A-1", false), makeTicket("A-2", false), makeTicket("A-3", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
    expect(overlaid.find((t) => t.key === "A-3")?.jiraStatus).toBe("TO DO");
    expect(showToast).toHaveBeenLastCalledWith("Status set for 2 issues");
  });

  it("clears the overlay on rows whose PUT rejected and toasts a partial failure", async () => {
    apiFetch.mockImplementation((url: string) => (url.includes("A-2") ? Promise.reject(new Error("boom")) : Promise.resolve(undefined)));
    const { result, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);
    await act(async () => { await result.current.bulkSetStatus("DONE", new Set(["A-1", "A-2"])); });

    const overlaid = applyPendingEdits([makeTicket("A-1", false), makeTicket("A-2", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.find((t) => t.key === "A-1")?.jiraStatus).toBe("DONE");
    expect(hasPendingEdit("A-2", "jiraStatus")).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith("Failed for 1 issue (1 updated)");
  });
});

describe("useRowActions - bulkSetEpic", () => {
  beforeEach(() => { updateEpic.mockReset().mockResolvedValue({}); __resetPendingEdits(); });

  it("optimistically overlays the epic name + key on every target, writes, revalidates", async () => {
    const { result, mutateTickets, showToast } = setup([makeTicket("A-1", false), makeTicket("A-2", false)]);
    await act(async () => { await result.current.bulkSetEpic("VPL-100", "Checkout", new Set(["A-1", "A-2"])); });

    expect(updateEpic).toHaveBeenCalledWith("A-1", "VPL-100");
    expect(updateEpic).toHaveBeenCalledWith("A-2", "VPL-100");
    const overlaid = applyPendingEdits([makeTicket("A-1", false), makeTicket("A-2", false)], __getPendingEdits(), Date.now())!;
    expect(overlaid.every((t) => t.epic === "Checkout" && t.epicKey === "VPL-100")).toBe(true);
    expect(mutateTickets).toHaveBeenCalled();
    expect(showToast).toHaveBeenLastCalledWith("Epic updated for 2 issues");
  });

  it("clears the overlay and reports failure when a request rejects", async () => {
    updateEpic.mockRejectedValue(new Error("boom"));
    const { result, showToast } = setup([makeTicket("A-1", false)]);
    await act(async () => { await result.current.bulkSetEpic("VPL-100", "Checkout", new Set(["A-1"])); });

    expect(hasPendingEdit("A-1", "epic")).toBe(false);
    expect(hasPendingEdit("A-1", "epicKey")).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith("Failed for 1 issue");
  });
});

describe("useRowActions - bulkSetReadiness", () => {
  beforeEach(() => { updateMetadata.mockReset().mockResolvedValue({}); __resetPendingEdits(); });

  it("writes the metadata, registers a readiness overlay, and drives the board map", async () => {
    const { result, setReadinessMap, showToast } = setup([makeTicket("A-1", false)]);
    await act(async () => { await result.current.bulkSetReadiness("ready_to_refine", new Set(["A-1"])); });

    expect(updateMetadata).toHaveBeenCalledWith("A-1", { readiness: "ready_to_refine" });
    expect(hasPendingEdit("A-1", "readiness")).toBe(true);
    expect(setReadinessMap).toHaveBeenCalled();
    expect(showToast).toHaveBeenLastCalledWith("Readiness set for 1 issue");
  });
});

describe("useRowActions - bulkMoveSprint (board overlay + dest-cache injection)", () => {
  beforeEach(() => { moveSprint.mockReset().mockResolvedValue(undefined); globalMutate.mockReset(); __resetPendingEdits(); });

  it("removes moved tickets from a per-sprint source and injects them into the destination", async () => {
    const source = [makeTicket("A-1", false, "100"), makeTicket("A-2", false, "100"), makeTicket("A-3", false, "100")];
    const { result } = setup(source, "/api/tickets?sprintId=100");

    let outcome: { ok: boolean; count: number; destName: string } | undefined;
    await act(async () => { outcome = await result.current.bulkMoveSprint("200", new Set(["A-1", "A-2"])); });

    expect(outcome).toEqual({ ok: true, count: 2, destName: "BT: 200" });
    expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["A-1", "A-2"], targetSprintId: "200", topKeys: [] });

    const sourceCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=100");
    expect(runGlobalUpdater(sourceCall!, source).map((t) => t.key)).toEqual(["A-3"]);

    const destCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=200");
    const injected = runGlobalUpdater(destCall!, undefined);
    expect(injected.map((t) => t.key)).toEqual(["A-1", "A-2"]);
    expect(injected.every((t) => t.sprintId === "200")).toBe(true);
  });

  it("updates sprintId in place (no removal) in the All view", async () => {
    const all = [makeTicket("A-1", false, "100"), makeTicket("A-2", false, "300")];
    const { result } = setup(all, "/api/tickets");
    await act(async () => { await result.current.bulkMoveSprint("200", new Set(["A-1"])); });

    const sourceCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets");
    const next = runGlobalUpdater(sourceCall!, all);
    expect(next.map((t) => t.key)).toEqual(["A-1", "A-2"]);
    expect(next.find((t) => t.key === "A-1")?.sprintId).toBe("200");
    expect(next.find((t) => t.key === "A-2")?.sprintId).toBe("300");
  });

  it("targets the backlog key and clears sprintId when moving to backlog", async () => {
    const source = [makeTicket("A-1", false, "100")];
    const { result } = setup(source, "/api/tickets?sprintId=100");
    let outcome: { ok: boolean; count: number; destName: string } | undefined;
    await act(async () => { outcome = await result.current.bulkMoveSprint("__backlog__", new Set(["A-1"])); });

    expect(outcome).toEqual({ ok: true, count: 1, destName: "backlog" });
    expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["A-1"], targetSprintId: "__backlog__", topKeys: ["A-1"] });
    const destCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=__backlog__");
    expect(runGlobalUpdater(destCall!, undefined)[0].sprintId).toBeUndefined();
  });

  it("sends the whole batch to the bottom of a regular sprint regardless of status", async () => {
    const source = [
      makeTicket("A-1", false, "100", "TO DO"),
      makeTicket("A-2", false, "100", "IN PROGRESS"),
      makeTicket("A-3", false, "100", "TEST"),
    ];
    const { result } = setup(source, "/api/tickets?sprintId=100");
    await act(async () => { await result.current.bulkMoveSprint("200", new Set(["A-1", "A-2", "A-3"])); });

    expect(moveSprint).toHaveBeenCalledWith({ issueKeys: ["A-1", "A-2", "A-3"], targetSprintId: "200", topKeys: [] });
  });

  it("does not duplicate a ticket already present in the destination cache", async () => {
    const source = [makeTicket("A-1", false, "100")];
    const { result } = setup(source, "/api/tickets?sprintId=100");
    await act(async () => { await result.current.bulkMoveSprint("200", new Set(["A-1"])); });

    const destCall = globalMutate.mock.calls.find((c) => c[0] === "/api/tickets?sprintId=200");
    const merged = runGlobalUpdater(destCall!, [makeTicket("A-1", false, "200")]);
    expect(merged.filter((t) => t.key === "A-1")).toHaveLength(1);
  });

  it("writes no destination-cache state when the move fails", async () => {
    moveSprint.mockRejectedValue(new Error("boom"));
    const source = [makeTicket("A-1", false, "100")];
    const { result } = setup(source, "/api/tickets?sprintId=100");
    let outcome: { ok: boolean; count: number; destName: string } | undefined;
    await act(async () => { outcome = await result.current.bulkMoveSprint("200", new Set(["A-1"])); });

    expect(outcome).toEqual({ ok: false, count: 1, destName: "BT: 200" });
    expect(globalMutate).not.toHaveBeenCalled();
  });
});
