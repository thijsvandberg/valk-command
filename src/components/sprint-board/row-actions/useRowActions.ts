"use client";

import { useCallback, useMemo, useState } from "react";
import type React from "react";
import type { JiraStatus, TicketReadiness, Sprint } from "@/types/ticket";
import type { FlagState, BookmarkState } from "@/components/sprint-board/ticket-action-menu";
import { scopedMutate } from "@/lib/swr-scoped-mutate";
import { useBookmarkNoteCapture } from "@/contexts/BookmarkNoteContext";
import type { CreatedSprint } from "@/components/sprint-board/CreateSprintModal";
import { apiFetch, jira, tickets as ticketsApi } from "@/lib/api-client";
import { bulkReviewStories, bulkGenerateSubtasks } from "@/components/sprint-board/sprint-board-utils";
import { topKeysForMove } from "@/lib/sprint-placement";
import { computeQuickMoves, type QuickMoveOption } from "@/lib/quick-moves";
import { nextSprintName, latestRegularSprint } from "@/lib/sprint-utils";
import { getJiraUrl } from "@/lib/jira-url";
import type { RowActionsAdapter } from "@/components/sprint-board/row-actions/adapter";

/** Outcome of a sprint move, so a host can render richer feedback (sprint name + link). */
export interface MoveResult { ok: boolean; count: number; destName: string }

/**
 * Trim and case-insensitively dedupe a label set (existing + additions), keeping the
 * first-seen casing. Prevents `"bug"` and `"Bug "` from accumulating as distinct
 * labels on a bulk "add" (BRDG-406).
 */
export function mergeLabels(existing: string[], adding: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of [...existing, ...adding]) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!seen.has(key)) seen.set(key, label);
  }
  return [...seen.values()];
}

interface UseRowActionsOpts {
  /** Optimistic display + revalidation for the active surface. */
  adapter: RowActionsAdapter;
  /** The current multi-select; bulk actions default to it when given no explicit set. */
  selectedKeys: Set<string>;
  sprints: Sprint[];
  pinnedSprintIds: string[];
  backlogTargetName: string;
  showToast: (message: React.ReactNode, durationMs?: number) => void;
  /** Inject a freshly created sprint into the host's sprint cache so a follow-up
   *  move resolves its id (each surface knows its own cache shape). Omit on surfaces
   *  that own their create-sprint flow (the board pins + navigates). */
  injectSprint?: (sprint: CreatedSprint) => void;
  /** Current sprint NAME of a row (overlay-aware), for the BRDG-369 quick-move options.
   *  Defaults to the adapter's raw ticket sprint when a surface doesn't track moves. */
  currentSprintName?: (key: string) => string | null;
  /** How to derive the right-click flag state. "ticket" reads `getTicket().flagged`;
   *  "mixed" is for surfaces whose row carries no flag field (inbox). */
  flagSource: "ticket" | "mixed";
  /** Board wraps the move with its own loading + rich toast + capacity-meter refresh. */
  onMove?: (targetSprintId: string, keys: Set<string>) => void | Promise<void>;
  /** Surfaces that report move failures in a banner (epic) instead of a toast. */
  onMoveError?: (message: string) => void;
  /** Called inside `handleRowContextMenu` with the right-clicked key before the menu
   *  opens, so a host can react (the board clears its side panel). */
  onContextMenuOpen?: (key: string) => void;
  /** Overrides the default create-sprint-then-move on quick-move auto-create. The board
   *  pins + navigates to the new sprint instead of injecting it into a cache. When given,
   *  the hook calls this instead of `injectSprint` + `move`. */
  onConfirmQuickCreate?: (sprint: CreatedSprint, keys: Set<string>) => void;
}

/**
 * Shared row-actions dispatch + glue for the Sprint Board, Epic children and Inbox
 * (BRDG-374). One implementation of every bulk action (status / readiness / epic /
 * move / quick-move / assignee / labels / flag / review / subtasks / copy / refine)
 * plus the triplicated glue (`rowMenu` context-menu state, quick-move + create-sprint
 * signalling, flag-state). Each surface supplies a `RowActionsAdapter` that reflects
 * the change in its own optimism model; nothing else differs.
 */
export function useRowActions(opts: UseRowActionsOpts) {
  const { adapter, selectedKeys, sprints, pinnedSprintIds, backlogTargetName, showToast, injectSprint, flagSource, onMove, onMoveError, onContextMenuOpen, onConfirmQuickCreate } = opts;
  const { sprintNameMap } = adapter;
  const { captureBookmarkNote } = useBookmarkNoteCapture();
  // Depend on opts.currentSprintName (a callback the host should memoize), NOT the
  // whole opts literal: opts is a new object every render, so depending on it
  // recreated this callback each render and defeated the memoization of
  // quickMovesFor / currentSprintIdsFor downstream (BRDG-406).
  const optsCurrentSprintName = opts.currentSprintName;
  const currentSprintName = useCallback(
    (key: string): string | null => {
      if (optsCurrentSprintName) return optsCurrentSprintName(key);
      const t = adapter.getTicket(key);
      return t?.sprintId ? (sprintNameMap[t.sprintId] ?? null) : null;
    },
    [optsCurrentSprintName, adapter, sprintNameMap],
  );

  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; targets: Set<string> } | null>(null);
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [refineKeys, setRefineKeys] = useState<string[]>([]);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  // Keys with an in-flight bulk readiness save; the board renders a spinner for them.
  const [inflightKeys, setInflightKeys] = useState<Set<string>>(new Set());
  // Quick-move auto-create (BRDG-369): a "Move to next" can target a sprint that does
  // not exist yet; selecting it raises this signal, the host renders CreateSprintModal.
  const [quickCreate, setQuickCreate] = useState<{ name: string; keys: Set<string> } | null>(null);
  const [pendingPlanSprintName, setPendingPlanSprintName] = useState<string | null>(null);

  const destNameFor = useCallback(
    (targetSprintId: string): string | null =>
      targetSprintId === "__backlog__" ? null : (sprintNameMap[targetSprintId] ?? sprints.find((s) => s.id === targetSprintId)?.name ?? null),
    [sprintNameMap, sprints],
  );

  // --- Generic field edits: optimistic begin -> write per key -> confirm/revert ---

  const runFieldEdit = useCallback(
    async (
      field: Parameters<RowActionsAdapter["beginEdit"]>[1],
      value: unknown,
      keys: string[],
      write: (key: string) => Promise<unknown>,
      label: string,
    ) => {
      if (keys.length === 0) return;
      adapter.beginEdit(keys, field, value);
      // Promise.allSettled preserves input order, so results[i] is the outcome of
      // write(keys[i]). This index alignment is load-bearing for attributing
      // confirm vs revert per key; do not switch to an unordered settle.
      const results = await Promise.allSettled(keys.map(write));
      const ok: string[] = [];
      const failed: string[] = [];
      keys.forEach((k, i) => (results[i].status === "fulfilled" ? ok.push(k) : failed.push(k)));
      if (ok.length) adapter.confirmEdit(ok, field);
      if (failed.length) adapter.revertEdit(failed, field);
      // Refresh the cross-sprint bookmark list (launcher quick-list + /bookmarks) so a
      // toggle from any surface reflects there without a manual refresh (BRDG-355).
      if (field === "bookmarked" && ok.length) scopedMutate("/api/bookmarks");
      // Offer the optional quick-note capture only on a single-item bookmark-ON that
      // actually succeeded (BRDG-475). ok.length === 1 skips bulk / multi-target menus;
      // value === true skips removals; ok[0] (not keys[0]) means the write landed.
      if (field === "bookmarked" && value === true && ok.length === 1) captureBookmarkNote(ok[0]);
      if (failed.length) {
        const updated = keys.length - failed.length;
        showToast(`Failed for ${failed.length} issue${failed.length === 1 ? "" : "s"}${updated > 0 ? ` (${updated} updated)` : ""}`);
      } else {
        showToast(`${label} ${keys.length} issue${keys.length === 1 ? "" : "s"}`);
      }
    },
    [adapter, showToast, captureBookmarkNote],
  );

  const bulkSetStatus = useCallback(
    (status: JiraStatus, keys: Set<string> = selectedKeys) =>
      runFieldEdit("jiraStatus", status, [...keys], (k) => apiFetch(`/api/tickets/${encodeURIComponent(k)}/status`, { method: "PUT", body: { status } }), "Status set for"),
    [runFieldEdit, selectedKeys],
  );

  const bulkSetReadiness = useCallback(
    async (readiness: TicketReadiness | null, keys: Set<string> = selectedKeys) => {
      const list = [...keys];
      setInflightKeys((prev) => { const next = new Set(prev); list.forEach((k) => next.add(k)); return next; });
      // try/finally so a throw inside runFieldEdit cannot leave a key stuck in the
      // in-flight set (a permanently spinning readiness pill).
      try {
        await runFieldEdit("readiness", readiness, list, (k) => ticketsApi.updateMetadata(k, { readiness }), "Readiness set for");
      } finally {
        setInflightKeys((prev) => { const next = new Set(prev); list.forEach((k) => next.delete(k)); return next; });
      }
    },
    [runFieldEdit, selectedKeys],
  );

  const bulkSetEpic = useCallback(
    (epicKey: string | null, epicName: string | null = null, keys: Set<string> = selectedKeys) =>
      runFieldEdit("epic", { epicKey, epicName }, [...keys], (k) => ticketsApi.updateEpic(k, epicKey), "Epic updated for"),
    [runFieldEdit, selectedKeys],
  );

  const bulkUpdateAssignee = useCallback(
    (accountId: string | null, name: string | null, avatar: string | null = null, keys: Set<string> = selectedKeys) =>
      // Send `avatar` like the single-row path (useTicketActions) so bulk-reassigned
      // rows show the avatar immediately instead of initials until the next
      // revalidation (BRDG-406).
      runFieldEdit("assignee", null, [...keys], (k) => jira.assign({ issueKey: k, accountId, name, avatar }), "Assignee updated for"),
    [runFieldEdit, selectedKeys],
  );

  const bulkUpdateLabels = useCallback(
    (labels: string[], mode: "add" | "set", keys: Set<string> = selectedKeys) =>
      runFieldEdit("labels", null, [...keys], async (k) => {
        if (mode === "set") return ticketsApi.updateLabels(k, mergeLabels([], labels));
        // "add" merges with the ticket's current labels. The list payload omits
        // labels (the list-vs-detail split, see client-data-and-memory.md), so the
        // adapter cannot supply them and a per-key detail read is the authoritative
        // source. mergeLabels trims and dedupes case-insensitively so "bug" / "Bug "
        // no longer accumulate as distinct labels.
        const detail = await apiFetch<{ labels?: string[] }>(`/api/tickets/${encodeURIComponent(k)}`);
        return ticketsApi.updateLabels(k, mergeLabels(detail?.labels ?? [], labels));
      }, "Labels updated for"),
    [runFieldEdit, selectedKeys],
  );

  // A reason, when given, is posted as a Jira comment per ticket by the toggle route.
  const bulkSetFlagged = useCallback(
    (flagged: boolean, reason: string | null, keys: Set<string> = selectedKeys) =>
      runFieldEdit("flagged", flagged, [...keys], (k) => ticketsApi.toggleFlag(k, flagged, reason ?? undefined), flagged ? "Flagged" : "Unflagged"),
    [runFieldEdit, selectedKeys],
  );

  // Bookmark is Bridge-local metadata (BRDG-355), written via the metadata PUT, not
  // the flag route. runFieldEdit rides the board overlay so the badge shows instantly
  // and never snaps back.
  const bulkSetBookmarked = useCallback(
    (bookmarked: boolean, keys: Set<string> = selectedKeys) =>
      runFieldEdit("bookmarked", bookmarked, [...keys], (k) => ticketsApi.setBookmarked(k, bookmarked), bookmarked ? "Bookmarked" : "Removed bookmark from"),
    [runFieldEdit, selectedKeys],
  );

  // --- Sprint move: mechanics only (no toast); see `move` for the toasted entry ---

  const bulkMoveSprint = useCallback(
    async (targetSprintId: string, keys: Set<string> = selectedKeys, position?: "top" | "bottom"): Promise<MoveResult> => {
      const list = [...keys];
      const destName = destNameFor(targetSprintId);
      const isBacklog = targetSprintId === "__backlog__";
      // Mirror the route's `t.sprintName || undefined`: backlog clears the sprint.
      const newSprintId = isBacklog ? undefined : targetSprintId;
      const moved = adapter.getTickets().filter((t) => keys.has(t.key)).map((t) => ({ ...t, sprintId: newSprintId }));
      adapter.beginMove(moved, targetSprintId, destName);
      try {
        // Placement rule (BRDG-370): a regular sprint takes the whole batch at the
        // bottom; a backlog destination takes it at the top. An explicit position
        // (BRDG-362 top/bottom buttons) overrides it — the route lets topKeys win,
        // so the default must be suppressed when a position is given.
        const topKeys = position ? undefined : topKeysForMove(list, destName);
        await jira.moveSprint({ issueKeys: list, targetSprintId, topKeys, position });
        adapter.confirmMove({ moved, keys: list, targetSprintId, newSprintId });
        return { ok: true, count: list.length, destName: destName ?? "backlog" };
      } catch {
        adapter.revertMove(list);
        return { ok: false, count: list.length, destName: destName ?? "backlog" };
      }
    },
    [adapter, destNameFor, selectedKeys],
  );

  // Toasted move used by the bar/menu and quick-moves on surfaces that don't wrap it
  // (inbox/epic). The board passes `onMove` to drive its own loading + rich toast + meter.
  const moveSprint = useCallback(
    async (targetSprintId: string, keys: Set<string> = selectedKeys, position?: "top" | "bottom") => {
      const list = [...keys];
      if (list.length === 0) return;
      const { ok } = await bulkMoveSprint(targetSprintId, keys, position);
      if (ok) showToast(`Moved ${list.length} issue${list.length === 1 ? "" : "s"} to sprint`);
      else if (onMoveError) onMoveError(`Failed to move ${list.length} issue${list.length === 1 ? "" : "s"} to sprint`);
      else showToast(`Failed to move ${list.length} issue${list.length === 1 ? "" : "s"} to sprint`);
    },
    [bulkMoveSprint, selectedKeys, showToast, onMoveError],
  );

  const move = useMemo(() => (onMove ?? moveSprint), [onMove, moveSprint]);

  // --- Quick moves (BRDG-369) ---

  const quickMovesFor = useCallback(
    (targets: Set<string>): QuickMoveOption[] => {
      const currentSprintNames = [...targets].map((k) => currentSprintName(k));
      return computeQuickMoves({ currentSprintNames, sprints, backlogTargetName });
    },
    [currentSprintName, sprints, backlogTargetName],
  );

  // The selection's current sprint id, for excluding it from "More sprints". Only when
  // EVERY target sits in the same (named) sprint; a mixed selection excludes nothing.
  const currentSprintIdsFor = useCallback(
    (targets: Set<string>): string[] => {
      const names = new Set([...targets].map((k) => currentSprintName(k)));
      if (names.size !== 1) return [];
      const name = [...names][0];
      if (!name) return [];
      const id = sprints.find((s) => s.name === name)?.id;
      return id ? [id] : [];
    },
    [currentSprintName, sprints],
  );

  const handleQuickMove = useCallback(
    (opt: QuickMoveOption, targets: Set<string> = selectedKeys) => {
      if (targets.size === 0) return;
      if (opt.createName) {
        setPendingPlanSprintName(opt.createName); // feeds the create modal's date prediction
        setQuickCreate({ name: opt.createName, keys: new Set(targets) });
        return;
      }
      if (opt.targetSprintId) void move(opt.targetSprintId, targets);
    },
    [selectedKeys, move],
  );

  // --- Create-sprint signal (host renders CreateSprintModal from these) ---

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
      // A host that owns its create flow (the board pins + navigates) takes over here;
      // otherwise inject the sprint into the cache and move the targets in.
      if (onConfirmQuickCreate) {
        onConfirmQuickCreate(sprint, keys);
        return;
      }
      injectSprint?.(sprint);
      void move(String(sprint.id), keys);
      showToast(`Created ${sprint.name} and moved ${keys.size} issue${keys.size === 1 ? "" : "s"} in`);
    },
    [quickCreate, closeQuickCreate, onConfirmQuickCreate, injectSprint, move, showToast],
  );

  // --- AI assist + list ops ---

  const handleBulkReview = useCallback(
    async (keys: Set<string> = selectedKeys) => {
      const list = [...keys];
      if (!list.length) return;
      showToast(`Reviewing ${list.length} issue${list.length === 1 ? "" : "s"}...`);
      await bulkReviewStories(list);
      adapter.mutate();
      showToast(`Reviewed ${list.length} issue${list.length === 1 ? "" : "s"}`);
    },
    [selectedKeys, adapter, showToast],
  );

  const handleBulkGenerate = useCallback(
    async (keys: Set<string> = selectedKeys) => {
      const list = [...keys];
      if (!list.length) return;
      setBulkGenerating(true);
      showToast(`Generating subtasks for ${list.length} issue${list.length === 1 ? "" : "s"}...`);
      try {
        const { succeeded, failed } = await bulkGenerateSubtasks(list);
        showToast(failed ? `Generated subtasks for ${succeeded}, ${failed} failed` : `Subtask suggestions sent for ${succeeded} issue${succeeded === 1 ? "" : "s"}`);
        adapter.mutate();
      } finally {
        setBulkGenerating(false);
      }
    },
    [selectedKeys, adapter, showToast],
  );

  const copySelected = useCallback(
    (keys: Set<string> = selectedKeys) => {
      const sel = adapter.getTickets().filter((t) => keys.has(t.key));
      if (!sel.length) return;
      navigator.clipboard
        .writeText(sel.map((t) => `${t.title} - ${getJiraUrl(t.key)}`).join("\n"))
        .then(() => showToast(`Copied ${sel.length} issue${sel.length === 1 ? "" : "s"} to clipboard`))
        .catch(() => showToast("Failed to copy to clipboard"));
    },
    [selectedKeys, adapter, showToast],
  );

  const openRefine = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    setRefineKeys(keys);
    setRefineModalOpen(true);
  }, []);

  // --- Glue: right-click context menu + flag state ---

  // Right-clicking a checked row acts on the whole selection; otherwise just that row.
  const handleRowContextMenu = useCallback(
    (key: string, e: React.MouseEvent) => {
      const targets = selectedKeys.has(key) && selectedKeys.size > 0 ? new Set(selectedKeys) : new Set([key]);
      onContextMenuOpen?.(key);
      setRowMenu({ x: e.clientX, y: e.clientY, targets });
    },
    [selectedKeys, onContextMenuOpen],
  );

  const computeFlagState = useCallback(
    (keys: Set<string>): FlagState => {
      if (flagSource === "mixed") return "mixed";
      const sel = [...keys].map((k) => adapter.getTicket(k)).filter((t): t is NonNullable<typeof t> => Boolean(t));
      if (sel.length === 0) return "mixed";
      const flaggedCount = sel.filter((t) => t.flagged).length;
      if (flaggedCount === 0) return "unflagged";
      if (flaggedCount === sel.length) return "flagged";
      return "mixed";
    },
    [flagSource, adapter],
  );

  // Unlike flag, every surface's row carries `bookmarked` (it comes off the shared
  // /api/tickets payload), so the real state can be computed here even on the inbox.
  const computeBookmarkState = useCallback(
    (keys: Set<string>): BookmarkState => {
      const sel = [...keys].map((k) => adapter.getTicket(k)).filter((t): t is NonNullable<typeof t> => Boolean(t));
      if (sel.length === 0) return "mixed";
      const count = sel.filter((t) => t.bookmarked).length;
      if (count === 0) return "unbookmarked";
      if (count === sel.length) return "bookmarked";
      return "mixed";
    },
    [adapter],
  );

  return {
    // context menu
    rowMenu,
    setRowMenu,
    handleRowContextMenu,
    computeFlagState,
    computeBookmarkState,
    // bulk dispatch
    bulkSetStatus,
    bulkSetReadiness,
    bulkSetEpic,
    bulkUpdateAssignee,
    bulkUpdateLabels,
    bulkSetFlagged,
    bulkSetBookmarked,
    bulkMoveSprint,
    moveSprint,
    quickMovesFor,
    currentSprintIdsFor,
    handleQuickMove,
    inflightKeys,
    // AI assist + list ops
    handleBulkReview,
    handleBulkGenerate,
    isGeneratingSubtasks: bulkGenerating,
    copySelected,
    // refinement modal
    openRefine,
    refineModalOpen,
    setRefineModalOpen,
    refineKeys,
    // create-sprint signal
    quickCreate,
    closeQuickCreate,
    confirmQuickCreate,
    suggestedSprintName,
    planPrevSprint,
  };
}
