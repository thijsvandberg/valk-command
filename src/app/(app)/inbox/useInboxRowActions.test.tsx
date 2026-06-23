import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useInboxRowActions } from "./useInboxRowActions";
import type { NewStoryRow } from "@/lib/new-stories-types";

// --- Mocks ---------------------------------------------------------------

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({
    sprints: [
      { id: 139, name: "BT: 139", state: "active", startDate: null, endDate: null },
      { id: 140, name: "BT: 140", state: "future", startDate: null, endDate: null },
      { id: 999, name: "BT: Backlog", state: "backlog", startDate: null, endDate: null },
    ],
    mutate: vi.fn(),
  }),
  useSprintSlots: () => ({ data: [] }),
}));

vi.mock("@/hooks/useBacklogDropTarget", () => ({
  useBacklogDropTarget: () => ({ backlogTargetName: "BT: Backlog" }),
}));

vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  mapJiraSprints: (raw: { id: number; name: string; state: string; startDate: string | null; endDate: string | null }[] | undefined) =>
    (raw ?? []).map((s) => ({
      id: String(s.id),
      name: s.name,
      state: s.state === "active" ? "active" : s.state === "backlog" ? "backlog" : s.state === "closed" ? "closed" : "future",
      dateRange: "",
      ticketCount: 0,
      startDate: s.startDate ?? null,
      endDate: s.endDate ?? null,
      goal: null,
    })),
  bulkReviewStories: vi.fn().mockResolvedValue(undefined),
  bulkGenerateSubtasks: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
}));

const apiFetch = vi.fn().mockResolvedValue({});
const jira = { assign: vi.fn().mockResolvedValue({}), moveSprint: vi.fn().mockResolvedValue({}) };
const tickets = {
  updateMetadata: vi.fn().mockResolvedValue({}),
  updateEpic: vi.fn().mockResolvedValue({}),
  updateLabels: vi.fn().mockResolvedValue({}),
  toggleFlag: vi.fn().mockResolvedValue({}),
  get: vi.fn().mockResolvedValue({ labels: ["existing"] }),
};
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  jira: { assign: (...a: unknown[]) => jira.assign(...a), moveSprint: (...a: unknown[]) => jira.moveSprint(...a) },
  tickets: {
    updateMetadata: (...a: unknown[]) => tickets.updateMetadata(...a),
    updateEpic: (...a: unknown[]) => tickets.updateEpic(...a),
    updateLabels: (...a: unknown[]) => tickets.updateLabels(...a),
    toggleFlag: (...a: unknown[]) => tickets.toggleFlag(...a),
    get: (...a: unknown[]) => tickets.get(...a),
  },
  ApiError: class ApiError extends Error {},
}));

// --- Helpers -------------------------------------------------------------

function row(key: string, sprintName: string | null): NewStoryRow {
  return {
    key,
    title: `Story ${key}`,
    type: "story",
    jiraStatus: "TO DO",
    epic: null,
    epicKey: null,
    storyPoints: null,
    assignee: null,
    reporter: null,
    sprintName,
    jiraCreatedAt: null,
  };
}

const ROWS = [row("VPL-1", "BT: 139"), row("VPL-2", "BT: 139")];
const mutateList = vi.fn().mockResolvedValue(undefined);
const showToast = vi.fn();

function setup(checkedKeys: Set<string> = new Set()) {
  return renderHook((props: { checkedKeys: Set<string> }) =>
    useInboxRowActions({ rows: ROWS, checkedKeys: props.checkedKeys, mutateList, showToast }),
    { initialProps: { checkedKeys } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useInboxRowActions (BRDG-373)", () => {
  it("moves selected rows: calls jira.moveSprint and keeps the row via an overlay (AC #2/#7)", async () => {
    const { result } = setup();
    act(() => {
      result.current.handleBulkMoveSprint("140", new Set(["VPL-1"]));
    });
    expect(jira.moveSprint).toHaveBeenCalledWith(
      expect.objectContaining({ issueKeys: ["VPL-1"], targetSprintId: "140" }),
    );
    // Row stays in the inbox with the destination name overlaid (not removed).
    expect(result.current.localMoves["VPL-1"]).toBe("BT: 140");
    expect(mutateList).not.toHaveBeenCalledWith(expect.any(Function), expect.anything());
  });

  it("reverts the move overlay when the Jira round-trip fails (AC #7)", async () => {
    jira.moveSprint.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup();
    act(() => {
      result.current.handleBulkMoveSprint("140", new Set(["VPL-1"]));
    });
    await waitFor(() => expect(result.current.localMoves["VPL-1"]).toBeUndefined());
  });

  it("dispatches bulk status / readiness / epic / assignee / flag / labels to the right APIs (AC #3)", async () => {
    const { result } = setup();
    const keys = new Set(["VPL-1", "VPL-2"]);

    await act(async () => { await result.current.handleBulkStatus("DONE", keys); });
    expect(apiFetch).toHaveBeenCalledWith("/api/tickets/VPL-1/status", { method: "PUT", body: { status: "DONE" } });
    expect(apiFetch).toHaveBeenCalledWith("/api/tickets/VPL-2/status", { method: "PUT", body: { status: "DONE" } });

    await act(async () => { await result.current.handleBulkReadiness("ready_to_refine", keys); });
    expect(tickets.updateMetadata).toHaveBeenCalledWith("VPL-1", { readiness: "ready_to_refine" });

    await act(async () => { await result.current.handleBulkEpic("VPL-10", keys); });
    expect(tickets.updateEpic).toHaveBeenCalledWith("VPL-1", "VPL-10");

    await act(async () => { await result.current.handleBulkAssignee("acc-1", "Alice", keys); });
    expect(jira.assign).toHaveBeenCalledWith({ issueKey: "VPL-1", accountId: "acc-1", name: "Alice" });

    await act(async () => { await result.current.handleBulkFlag(true, keys); });
    expect(tickets.toggleFlag).toHaveBeenCalledWith("VPL-1", true);

    // mutateList revalidates the inbox list after each bulk op.
    expect(mutateList).toHaveBeenCalled();
  });

  it("label 'add' mode merges with existing labels read from the ticket (AC #3)", async () => {
    const { result } = setup();
    await act(async () => { await result.current.handleBulkLabels(["new"], "add", new Set(["VPL-1"])); });
    expect(tickets.get).toHaveBeenCalledWith("VPL-1");
    expect(tickets.updateLabels).toHaveBeenCalledWith("VPL-1", ["existing", "new"]);
  });

  it("computes quick-moves from the selection (next + backlog, active hidden when already in it) (AC #2)", () => {
    const { result } = setup();
    const opts = result.current.quickMovesFor(new Set(["VPL-1"]));
    const targets = opts.map((o) => o.targetSprintId);
    expect(targets).toContain("140"); // next sprint BT: 140 exists
    expect(targets).toContain("999"); // backlog
    // Already in the active sprint (139), so no active-sprint option.
    expect(targets).not.toContain("139");
  });

  it("opens the create-sprint modal for a quick-move that must create the next sprint (AC #2)", () => {
    const { result } = setup();
    act(() => {
      result.current.handleQuickMove(
        { id: "next", label: "Move to next", target: "BT: 200", targetSprintId: null, createName: "BT: 200" },
        new Set(["VPL-1"]),
      );
    });
    expect(result.current.quickCreate).toEqual({ name: "BT: 200", keys: new Set(["VPL-1"]) });
  });

  it("right-click on a selected row targets the whole selection; otherwise just that row (AC #6)", () => {
    const evt = { clientX: 10, clientY: 20 } as React.MouseEvent;

    const selected = setup(new Set(["VPL-1", "VPL-2"]));
    act(() => { selected.result.current.handleRowContextMenu("VPL-1", evt); });
    expect(selected.result.current.rowMenu?.targets).toEqual(new Set(["VPL-1", "VPL-2"]));

    const none = setup(new Set());
    act(() => { none.result.current.handleRowContextMenu("VPL-1", evt); });
    expect(none.result.current.rowMenu?.targets).toEqual(new Set(["VPL-1"]));
  });

  it("opens the refinement modal with the targeted keys", () => {
    const { result } = setup();
    act(() => { result.current.openRefine(["VPL-1", "VPL-2"]); });
    expect(result.current.refineModalOpen).toBe(true);
    expect(result.current.refineKeys).toEqual(["VPL-1", "VPL-2"]);
  });
});
