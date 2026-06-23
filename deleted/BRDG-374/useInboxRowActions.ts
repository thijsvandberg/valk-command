"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyedMutator } from "swr";
import type { JiraStatus, TicketReadiness, Sprint } from "@/types/ticket";
import type { NewStoriesResponse, NewStoryRow } from "@/lib/new-stories-types";
import type { FlagState } from "@/components/sprint-board/ticket-action-menu";
import type { CreatedSprint } from "@/components/sprint-board/CreateSprintModal";
import { useJiraSprints, useSprintSlots } from "@/hooks/useSprintBoard";
import { useBacklogDropTarget } from "@/hooks/useBacklogDropTarget";
import { mapJiraSprints, bulkReviewStories, bulkGenerateSubtasks } from "@/components/sprint-board/sprint-board-utils";
import { tickets, jira, apiFetch, ApiError } from "@/lib/api-client";
import { topKeysForMove } from "@/lib/sprint-placement";
import { computeQuickMoves, type QuickMoveOption } from "@/lib/quick-moves";
import { nextSprintName, latestRegularSprint } from "@/lib/sprint-utils";
import { getJiraUrl } from "@/lib/jira-url";

interface UseInboxRowActionsDeps {
  rows: NewStoryRow[];
  /** Keys ticked in the multi-select bar; bulk actions default to this set. */
  checkedKeys: Set<string>;
  mutateList: KeyedMutator<NewStoriesResponse>;
  showToast: (message: React.ReactNode, durationMs?: number) => void;
}

/**
 * The inbox's self-contained row-action layer (BRDG-373). It mirrors the
 * EpicChildrenSection pattern — `runBulk` + a local optimistic overlay +
 * `mutateList()` — rather than the board's `useTicketActions`, which is bound to
 * the board's `Ticket[]` caches (`saveTicketMetadata`/`handleBulkMoveSprint`
 * patch `/api/tickets*` directly) and would contaminate the board from here.
 * BRDG-374 will collapse this duplication into a shared module.
 */
export function useInboxRowActions({ rows, checkedKeys, mutateList, showToast }: UseInboxRowActionsDeps) {
  // Sprint metadata for the move actions + the "Move to Sprint" / quick-move pickers.
  const { sprints: rawSprints, mutate: mutateSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawSprints), [rawSprints]);
  const { backlogTargetName } = useBacklogDropTarget();
  const { data: sprintSlots } = useSprintSlots();
  const pinnedSprintIds = useMemo(
    () => [...(sprintSlots ?? [])].sort((a, b) => a.slotIndex - b.slotIndex).map((s) => s.sprintId),
    [sprintSlots],
  );

  // Optimistic sprint reassignments (key -> new sprint name, null for backlog). The
  // row stays in the inbox; only the chip changes. Self-heal drops the override once a
  // revalidated row reports the new sprint name (AC #7).
  const [localMoves, setLocalMoves] = useState<Record<string, string | null>>({});
  useEffect(() => {
    setLocalMoves((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const r of rows) {
        if (r.key in next && (r.sprintName ?? null) === next[r.key]) {
          delete next[r.key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; targets: Set<string> } | null>(null);
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineKeys, setRefineKeys] = useState<string[]>([]);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  // Quick-move auto-create (BRDG-369): "Move to next sprint" can target a sprint that
  // does not exist yet; selecting it opens CreateSprintModal prefilled, then moves the
  // selection into the created sprint.
  const [quickCreate, setQuickCreate] = useState<{ name: string; keys: Set<string> } | null>(null);
  const [pendingPlanSprintName, setPendingPlanSprintName] = useState<string | null>(null);

  // key -> Jira status, for the BRDG-370 placement rule.
  const statusByKey = useMemo(() => {
    const m: Record<string, string> = {};
    rows.forEach((r) => { m[r.key] = r.jiraStatus; });
    return m;
  }, [rows]);

  // key -> current sprint name (override wins), for the BRDG-369 quick-move options.
  const sprintNameByKey = useMemo(() => {
    const m: Record<string, string | null> = {};
    rows.forEach((r) => { m[r.key] = r.key in localMoves ? localMoves[r.key] : r.sprintName; });
    return m;
  }, [rows, localMoves]);

  const resolveSprintName = useCallback(
    (targetSprintId: string): string | null =>
      targetSprintId === "__backlog__" ? null : (sprints.find((s) => s.id === targetSprintId)?.name ?? null),
    [sprints],
  );

  // Runs an async op per key, revalidates the inbox list, and reports one toast.
  // Defaults to the checked selection (bulk bar); an explicit set targets the
  // right-clicked row(s).
  const runBulk = useCallback(
    async (verb: string, fn: (key: string) => Promise<unknown>, targetKeys?: Set<string>) => {
      const keys = [...(targetKeys ?? checkedKeys)];
      if (keys.length === 0) return;
      const results = await Promise.allSettled(keys.map(fn));
      void mutateList();
      const failed = results.filter((r) => r.status === "rejected").length;
      showToast(
        failed
          ? `Failed for ${failed} issue${failed === 1 ? "" : "s"}${failed < keys.length ? ` (${keys.length - failed} updated)` : ""}`
          : `${verb} ${keys.length} issue${keys.length === 1 ? "" : "s"}`,
      );
    },
    [checkedKeys, mutateList, showToast],
  );

  const handleBulkStatus = useCallback(
    (status: JiraStatus, keys?: Set<string>) =>
      runBulk("Status set for", (k) => apiFetch(`/api/tickets/${encodeURIComponent(k)}/status`, { method: "PUT", body: { status } }), keys),
    [runBulk],
  );

  const handleBulkReadiness = useCallback(
    (readiness: TicketReadiness | null, keys?: Set<string>) =>
      runBulk("Readiness set for", (k) => tickets.updateMetadata(k, { readiness }), keys),
    [runBulk],
  );

  const handleBulkEpic = useCallback(
    (epicKey: string | null, keys?: Set<string>) => runBulk("Epic updated for", (k) => tickets.updateEpic(k, epicKey), keys),
    [runBulk],
  );

  const handleBulkAssignee = useCallback(
    (accountId: string | null, name: string | null, keys?: Set<string>) =>
      runBulk("Assignee updated for", (k) => jira.assign({ issueKey: k, accountId, name }), keys),
    [runBulk],
  );

  const handleBulkFlag = useCallback(
    (flagged: boolean, keys?: Set<string>) =>
      runBulk(flagged ? "Flagged" : "Unflagged", (k) => tickets.toggleFlag(k, flagged), keys),
    [runBulk],
  );

  const handleBulkLabels = useCallback(
    (labels: string[], mode: "add" | "set", keys?: Set<string>) =>
      runBulk("Labels updated for", async (k) => {
        let finalLabels = labels;
        if (mode === "add") {
          const detail = await tickets.get(k);
          finalLabels = [...new Set([...(detail.labels ?? []), ...labels])];
        }
        return tickets.updateLabels(k, finalLabels);
      }, keys),
    [runBulk],
  );

  // Sprint move: optimistically overlay the destination name (row stays, chip updates),
  // then revalidate; revert and warn on a failed Jira round-trip.
  const handleBulkMoveSprint = useCallback(
    (targetSprintId: string, targetKeys?: Set<string>) => {
      const keys = [...(targetKeys ?? checkedKeys)];
      if (keys.length === 0) return;
      const newName = resolveSprintName(targetSprintId);
      setLocalMoves((prev) => { const next = { ...prev }; keys.forEach((k) => { next[k] = newName; }); return next; });
      // Placement rule (BRDG-370): backlog / in-flight land at the top, a regular
      // sprint at the bottom; newName is null for the generic backlog.
      const topKeys = topKeysForMove(keys, newName, (k) => statusByKey[k]);
      jira.moveSprint({ issueKeys: keys, targetSprintId, topKeys })
        .then(() => { void mutateList(); showToast(`Moved ${keys.length} issue${keys.length === 1 ? "" : "s"} to sprint`); })
        .catch((err) => {
          setLocalMoves((prev) => { const next = { ...prev }; keys.forEach((k) => delete next[k]); return next; });
          const detail = err instanceof ApiError ? err.message : "Jira API error";
          showToast(`Failed to move ${keys.length} issue${keys.length === 1 ? "" : "s"} to sprint: ${detail}`);
        });
    },
    [checkedKeys, resolveSprintName, statusByKey, mutateList, showToast],
  );

  const quickMovesFor = useCallback(
    (targets: Set<string>): QuickMoveOption[] => {
      const currentSprintNames = [...targets].map((k) => sprintNameByKey[k] ?? null);
      return computeQuickMoves({ currentSprintNames, sprints, backlogTargetName });
    },
    [sprintNameByKey, sprints, backlogTargetName],
  );

  const handleQuickMove = useCallback(
    (opt: QuickMoveOption, targets: Set<string> = checkedKeys) => {
      if (targets.size === 0) return;
      if (opt.createName) {
        setPendingPlanSprintName(opt.createName); // feeds the create modal's date prediction
        setQuickCreate({ name: opt.createName, keys: new Set(targets) });
        return;
      }
      if (opt.targetSprintId) handleBulkMoveSprint(opt.targetSprintId, targets);
    },
    [checkedKeys, handleBulkMoveSprint],
  );

  const handleBulkReview = useCallback(
    async (targetKeys?: Set<string>) => {
      const keys = [...(targetKeys ?? checkedKeys)];
      if (!keys.length) return;
      showToast(`Reviewing ${keys.length} issue${keys.length === 1 ? "" : "s"}...`);
      await bulkReviewStories(keys);
      void mutateList();
      showToast(`Reviewed ${keys.length} issue${keys.length === 1 ? "" : "s"}`);
    },
    [checkedKeys, mutateList, showToast],
  );

  const handleBulkGenerate = useCallback(
    async (targetKeys?: Set<string>) => {
      const keys = [...(targetKeys ?? checkedKeys)];
      if (!keys.length) return;
      setBulkGenerating(true);
      showToast(`Generating subtasks for ${keys.length} issue${keys.length === 1 ? "" : "s"}...`);
      try {
        const { succeeded, failed } = await bulkGenerateSubtasks(keys);
        showToast(failed ? `Generated for ${succeeded}, ${failed} failed` : `Subtask suggestions sent for ${succeeded} issue${succeeded === 1 ? "" : "s"}`);
        void mutateList();
      } finally {
        setBulkGenerating(false);
      }
    },
    [checkedKeys, mutateList, showToast],
  );

  const handleCopySelected = useCallback(() => {
    const sel = rows.filter((r) => checkedKeys.has(r.key));
    if (!sel.length) return;
    navigator.clipboard.writeText(sel.map((r) => `${r.title} - ${getJiraUrl(r.key)}`).join("\n"))
      .then(() => showToast(`Copied ${sel.length} issue${sel.length === 1 ? "" : "s"} to clipboard`))
      .catch(() => showToast("Failed to copy to clipboard"));
  }, [rows, checkedKeys, showToast]);

  const openRefine = useCallback((keys: string[]) => {
    setRefineKeys(keys);
    setRefineModalOpen(true);
  }, []);

  // Right-clicking a checked row acts on the whole selection; otherwise on that
  // single row (mirrors the board / epic children). AC #6.
  const handleRowContextMenu = useCallback(
    (key: string, e: React.MouseEvent) => {
      const targets = checkedKeys.has(key) && checkedKeys.size > 0 ? new Set(checkedKeys) : new Set([key]);
      setRowMenu({ x: e.clientX, y: e.clientY, targets });
    },
    [checkedKeys],
  );

  // NewStoryRow carries no flag field, so the inbox can't know the current state;
  // "mixed" offers both Flag and Remove flag (the action still writes correctly).
  const rowMenuFlagState: FlagState = "mixed";

  // --- Create-sprint (quick-move auto-create) modal inputs, owned here so the page
  //     only renders. Mirrors EpicChildrenSection's planPrevSprint date prediction. ---
  const latestRegular = useMemo(() => latestRegularSprint(sprints), [sprints]);
  const suggestedSprintName = useMemo(() => nextSprintName(sprints), [sprints]);
  const planPrevSprint: Sprint | null = useMemo(() => {
    const base = latestRegular?.sprint ?? null;
    if (!pendingPlanSprintName) return base;
    const team = pendingPlanSprintName.split(":")[0]?.trim();
    if (!team) return base;
    return latestRegularSprint(sprints.filter((s) => s.name.split(":")[0]?.trim() === team))?.sprint ?? base;
  }, [pendingPlanSprintName, sprints, latestRegular]);

  const closeQuickCreate = useCallback(() => {
    setQuickCreate(null);
    setPendingPlanSprintName(null);
  }, []);

  const confirmQuickCreate = useCallback(
    (sprint: CreatedSprint) => {
      const keys = quickCreate?.keys ?? new Set<string>();
      closeQuickCreate();
      // Inject the created sprint into the cached list so later moves resolve its id.
      void mutateSprints(
        (cur) =>
          cur && !cur.sprints.some((s) => s.id === sprint.id)
            ? { ...cur, sprints: [...cur.sprints, { id: sprint.id, name: sprint.name, state: sprint.state, startDate: sprint.startDate, endDate: sprint.endDate, goal: sprint.goal }] }
            : cur,
        { revalidate: false },
      );
      handleBulkMoveSprint(String(sprint.id), keys);
      showToast(`Created ${sprint.name} and moved ${keys.size} issue${keys.size === 1 ? "" : "s"} in`);
    },
    [quickCreate, closeQuickCreate, mutateSprints, handleBulkMoveSprint, showToast],
  );

  return {
    // rendering inputs
    sprints,
    pinnedSprintIds,
    localMoves,
    // row context menu
    rowMenu,
    setRowMenu,
    handleRowContextMenu,
    rowMenuFlagState,
    // dispatch (shared by the menu + the bulk bar)
    handleBulkStatus,
    handleBulkReadiness,
    handleBulkEpic,
    handleBulkAssignee,
    handleBulkFlag,
    handleBulkLabels,
    handleBulkMoveSprint,
    quickMovesFor,
    handleQuickMove,
    handleBulkReview,
    handleBulkGenerate,
    handleCopySelected,
    isGeneratingSubtasks: bulkGenerating,
    // refinement modal
    refineModalOpen,
    setRefineModalOpen,
    refineKeys,
    openRefine,
    // create-sprint (auto-create) modal
    quickCreate,
    closeQuickCreate,
    confirmQuickCreate,
    suggestedSprintName,
    planPrevSprint,
  };
}
