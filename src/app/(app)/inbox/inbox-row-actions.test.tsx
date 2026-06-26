import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState, useMemo } from "react";
import type { Sprint, Ticket } from "@/types/ticket";
import type { NewStoryRow } from "@/lib/new-stories-types";
import { useRowActions } from "@/components/sprint-board/row-actions/useRowActions";
import { makeInboxDispatchAdapter, type RowDataAdapter } from "@/components/sprint-board/row-actions/adapter";

// BRDG-374: the inbox is now wired on the shared useRowActions + an inbox dispatch
// adapter (write-through field edits; localMoves overlay for sprint moves). This
// replaces the former useInboxRowActions hook (moved to deleted/).

const apiFetch = vi.fn().mockResolvedValue({ labels: ["existing"] });
const moveSprint = vi.fn().mockResolvedValue({});
const assign = vi.fn().mockResolvedValue({});
const updateMetadata = vi.fn().mockResolvedValue({});
const updateEpic = vi.fn().mockResolvedValue({});
const updateLabels = vi.fn().mockResolvedValue({});
const toggleFlag = vi.fn().mockResolvedValue({});

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  jira: { assign: (...a: unknown[]) => assign(...a), moveSprint: (...a: unknown[]) => moveSprint(...a) },
  tickets: {
    updateMetadata: (...a: unknown[]) => updateMetadata(...a),
    updateEpic: (...a: unknown[]) => updateEpic(...a),
    updateLabels: (...a: unknown[]) => updateLabels(...a),
    toggleFlag: (...a: unknown[]) => toggleFlag(...a),
  },
}));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  bulkReviewStories: vi.fn().mockResolvedValue(undefined),
  bulkGenerateSubtasks: vi.fn().mockResolvedValue({ succeeded: 1, failed: 0 }),
}));

const SPRINTS: Sprint[] = [
  { id: "139", name: "BT: 139", state: "active", dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
  { id: "140", name: "BT: 140", state: "future", dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
  { id: "999", name: "BT: Backlog", state: "backlog", dateRange: "", ticketCount: 0, startDate: null, endDate: null, goal: null },
];

function row(key: string, sprintName: string | null): NewStoryRow {
  return { key, title: `Story ${key}`, type: "story", jiraStatus: "TO DO", epic: null, epicKey: null, storyPoints: null, assignee: null, reporter: null, sprintName, jiraCreatedAt: null };
}
const ROWS = [row("VPL-1", "BT: 139"), row("VPL-2", "BT: 139")];

const mutateList = vi.fn().mockResolvedValue(undefined);
const showToast = vi.fn();

function ticketFrom(r: NewStoryRow, sprintName: string | null): Ticket {
  return { ...r, jiraStatus: r.jiraStatus ?? "TO DO", flagged: false, readiness: null, poStatus: null, qualityScore: null, businessValue: null, editState: "clean", notes: "", sprintId: sprintName ?? undefined, openSubtaskCount: 0, totalSubtaskCount: 0 } as Ticket;
}

function setup(checkedKeys: Set<string> = new Set()) {
  return renderHook(
    (props: { checkedKeys: Set<string> }) => {
      const [localMoves, setLocalMoves] = useState<Record<string, string | null>>({});
      const nameForKey = (key: string): string | null => {
        const r = ROWS.find((x) => x.key === key);
        return r ? (key in localMoves ? localMoves[key] : r.sprintName) : null;
      };
      const adapter = useMemo(() => {
        const data: RowDataAdapter = {
          getTicket: (key) => { const r = ROWS.find((x) => x.key === key); return r ? ticketFrom(r, nameForKey(key)) : undefined; },
          getTickets: () => ROWS.map((r) => ticketFrom(r, nameForKey(r.key))),
          mutate: () => { void mutateList(); },
          activeListKey: "/api/new-stories",
          sprintNameMap: {},
        };
        return makeInboxDispatchAdapter(data, { setLocalMoves });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [localMoves]);
      const ra = useRowActions({ adapter, selectedKeys: props.checkedKeys, sprints: SPRINTS, pinnedSprintIds: [], backlogTargetName: "BT: Backlog", showToast, flagSource: "mixed", currentSprintName: nameForKey, injectSprint: vi.fn() });
      return { ra, localMoves };
    },
    { initialProps: { checkedKeys } },
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe("inbox row actions on the shared dispatch (BRDG-374)", () => {
  it("moves selected rows: jira.moveSprint + a localMoves overlay (row stays)", async () => {
    const { result } = setup();
    await act(async () => { await result.current.ra.moveSprint("140", new Set(["VPL-1"])); });
    expect(moveSprint).toHaveBeenCalledWith(expect.objectContaining({ issueKeys: ["VPL-1"], targetSprintId: "140" }));
    expect(result.current.localMoves["VPL-1"]).toBe("BT: 140");
    // The list is revalidated (no-arg), never patched with an optimistic-removal updater.
    expect(mutateList).not.toHaveBeenCalledWith(expect.any(Function), expect.anything());
  });

  it("reverts the move overlay when the Jira round-trip fails", async () => {
    moveSprint.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup();
    await act(async () => { await result.current.ra.moveSprint("140", new Set(["VPL-1"])); });
    await waitFor(() => expect(result.current.localMoves["VPL-1"]).toBeUndefined());
  });

  it("dispatches bulk status / readiness / epic / assignee / flag to the right APIs", async () => {
    const { result } = setup();
    const keys = new Set(["VPL-1", "VPL-2"]);
    await act(async () => { await result.current.ra.bulkSetStatus("DONE", keys); });
    expect(apiFetch).toHaveBeenCalledWith("/api/tickets/VPL-1/status", { method: "PUT", body: { status: "DONE" } });
    await act(async () => { await result.current.ra.bulkSetReadiness("ready_to_refine", keys); });
    expect(updateMetadata).toHaveBeenCalledWith("VPL-1", { readiness: "ready_to_refine" });
    await act(async () => { await result.current.ra.bulkSetEpic("VPL-10", null, keys); });
    expect(updateEpic).toHaveBeenCalledWith("VPL-1", "VPL-10");
    await act(async () => { await result.current.ra.bulkUpdateAssignee("acc-1", "Alice", null, keys); });
    expect(assign).toHaveBeenCalledWith({ issueKey: "VPL-1", accountId: "acc-1", name: "Alice", avatar: null });
    await act(async () => { await result.current.ra.bulkSetFlagged(true, null, keys); });
    expect(toggleFlag).toHaveBeenCalledWith("VPL-1", true, undefined);
    expect(mutateList).toHaveBeenCalled();
  });

  it("label 'add' mode merges with existing labels read from the ticket", async () => {
    const { result } = setup();
    await act(async () => { await result.current.ra.bulkUpdateLabels(["new"], "add", new Set(["VPL-1"])); });
    expect(apiFetch).toHaveBeenCalledWith("/api/tickets/VPL-1");
    expect(updateLabels).toHaveBeenCalledWith("VPL-1", ["existing", "new"]);
  });

  it("computes quick-moves from the selection (next + backlog, active hidden when already in it)", () => {
    const { result } = setup();
    const targets = result.current.ra.quickMovesFor(new Set(["VPL-1"])).map((o) => o.targetSprintId);
    expect(targets).toContain("140");
    expect(targets).toContain("999");
    expect(targets).not.toContain("139");
  });

  it("opens the create-sprint signal for a quick-move that must create the next sprint", () => {
    const { result } = setup();
    act(() => {
      result.current.ra.handleQuickMove(
        { id: "next", label: "Move to next sprint", target: "BT: 200", targetSprintId: null, createName: "BT: 200" },
        new Set(["VPL-1"]),
      );
    });
    expect(result.current.ra.quickCreate).toEqual({ name: "BT: 200", keys: new Set(["VPL-1"]) });
  });

  it("right-click on a selected row targets the whole selection; otherwise just that row", () => {
    const evt = { clientX: 10, clientY: 20 } as React.MouseEvent;
    const selected = setup(new Set(["VPL-1", "VPL-2"]));
    act(() => { selected.result.current.ra.handleRowContextMenu("VPL-1", evt); });
    expect(selected.result.current.ra.rowMenu?.targets).toEqual(new Set(["VPL-1", "VPL-2"]));
    const none = setup(new Set());
    act(() => { none.result.current.ra.handleRowContextMenu("VPL-1", evt); });
    expect(none.result.current.ra.rowMenu?.targets).toEqual(new Set(["VPL-1"]));
  });

  it("opens the refinement modal with the targeted keys", () => {
    const { result } = setup();
    act(() => { result.current.ra.openRefine(["VPL-1", "VPL-2"]); });
    expect(result.current.ra.refineModalOpen).toBe(true);
    expect(result.current.ra.refineKeys).toEqual(["VPL-1", "VPL-2"]);
  });
});
