"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
// useSWRConfig, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for provider-backed keys (BRDG-458).
import useSWR, { useSWRConfig } from "swr";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Inbox, Undo2, CheckCircle2 } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonRow } from "@/components/shared/Skeleton";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { useTicketDetail, useJiraSprints, useSprintSlots } from "@/hooks/useSprintBoard";
import { useBacklogDropTarget } from "@/hooks/useBacklogDropTarget";
import { useRowActions } from "@/components/sprint-board/row-actions/useRowActions";
import { makeInboxDispatchAdapter, type RowDataAdapter } from "@/components/sprint-board/row-actions/adapter";
import { pruneSelectionToVisible } from "@/components/sprint-board/row-actions/prune-selection";
import { BoardRow } from "@/components/sprint-board/BoardRow";
import { Checkbox } from "@/components/shared/Checkbox";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { UnifiedControlsCluster } from "@/components/sprint-board/UnifiedControlsCluster";
import { InboxGroupByDropdown } from "@/components/sprint-board/InboxGroupByDropdown";
import { BulkActionBar } from "@/components/sprint-board/BulkActionBar";
import { CursorMenu, TicketActionMenuContent } from "@/components/sprint-board/ticket-action-menu";
import { CreateSprintModal } from "@/components/sprint-board/CreateSprintModal";
import { AddToRefinementModal } from "@/components/refinement-session/AddToRefinementModal";
import { startDateFromPreviousEnd } from "@/lib/sprint-dates";
import { useInboxFilters } from "@/components/sprint-board/useInboxFilters";
import { useInboxGroupBy } from "@/components/sprint-board/useInboxGroupBy";
import { INBOX_SORT_OPTIONS } from "@/components/sprint-board/filter-bar-types";
import { saveTicketMetadata, mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import { buildTeamMap } from "@/lib/new-stories-grouping";
import { poUsers, userTeams, refinementSessions } from "@/lib/api-client";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { sessionLabel, compareSessions } from "@/components/refinement-session/refinement-utils";
import { useDefaultTeam } from "@/hooks/useDefaultTeam";
import { CONTENT_MAX } from "@/lib/layout";
import { relativeDate } from "@/lib/date-utils";
import { isNewSinceLastViewed } from "@/lib/inbox-last-viewed";
import type { Team } from "@/lib/sprint-utils";
import type { JiraStatus, Ticket } from "@/types/ticket";
import type { NewStoriesResponse, NewStoryRow } from "@/lib/new-stories-types";

// The full ticket management panel, shared with the sprint board / cleanup so a
// row click opens the identical side panel. Lazy: the heavier panel only loads
// once the PO opens a ticket.
const SidePanel = dynamic(
  () => import("@/components/sprint-board/SidePanel").then((m) => ({ default: m.SidePanel })),
  { ssr: false },
);

const LIST_KEY = "/api/new-stories";
const COUNT_KEY = "/api/new-stories/count";
const JSON_HEADERS = { "Content-Type": "application/json" };

function rowToTicket(row: NewStoryRow, effectiveSprintName: string | null = row.sprintName): Ticket {
  // Lightweight Ticket so the BoardRow paints instantly; SidePanel re-derives the
  // full content via its own detail fetch. The sprint name doubles as the sprint
  // id so the row's sprint chip renders (the inbox has no real sprint ids).
  // effectiveSprintName carries the optimistic move overlay (BRDG-373) so a moved
  // row's chip updates while the row stays in the inbox.
  return {
    key: row.key,
    title: row.title,
    type: row.type,
    epic: row.epic,
    epicKey: row.epicKey,
    jiraStatus: (row.jiraStatus ?? "TO DO") as JiraStatus,
    storyPoints: row.storyPoints,
    assignee: row.assignee,
    reporter: row.reporter,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    sprintId: effectiveSprintName ?? undefined,
    sprintDisplayName: effectiveSprintName,
    openSubtaskCount: 0,
    totalSubtaskCount: 0,
  };
}

function InboxView() {
  const pageTitle = usePageTitle("Inbox");
  const { toast, showToast, dismissToast } = useToast();
  const searchParams = useSearchParams();

  const { data, isLoading, error, mutate: mutateList } = useSWR<NewStoriesResponse>(LIST_KEY);

  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  // "New" baseline (BRDG-438): the moment the user last marked something read,
  // computed server-side as MAX(newStoryRead.readAt) and returned with the list.
  // Shared with the 2x/day digest so the counts always agree. A row is new via the
  // isNewSinceLastViewed predicate; a null baseline (never triaged) marks all new.
  const baselineAt = data?.baselineAt ?? null;
  const isNew = useCallback(
    (r: NewStoryRow) => isNewSinceLastViewed(r.jiraCreatedAt, baselineAt),
    [baselineAt],
  );

  // Sprint metadata for the move actions + the quick-move / create-sprint pickers.
  const { sprints: rawSprints, mutate: mutateSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawSprints), [rawSprints]);
  const { backlogTargetName } = useBacklogDropTarget();
  const { data: sprintSlots } = useSprintSlots();
  const pinnedSprintIds = useMemo(
    () => [...(sprintSlots ?? [])].sort((a, b) => a.slotIndex - b.slotIndex).map((s) => s.sprintId),
    [sprintSlots],
  );

  // Optimistic sprint reassignments (key -> new sprint name, null for backlog). The row
  // stays in the inbox; only the chip changes. Self-heal drops the override once a
  // revalidated row reports the new sprint name (BRDG-374 shared dispatch / AC #7).
  const [localMoves, setLocalMoves] = useState<Record<string, string | null>>({});
  useEffect(() => {
    setLocalMoves((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const r of rows) {
        if (r.key in next && (r.sprintName ?? null) === next[r.key]) { delete next[r.key]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [rows]);

  // Paint a row, applying the optimistic sprint-move overlay so a moved row's chip
  // updates while it stays in the inbox (AC #7).
  const toTicket = useCallback(
    (row: NewStoryRow): Ticket => rowToTicket(row, row.key in localMoves ? localMoves[row.key] : row.sprintName),
    [localMoves],
  );

  // Identity sprint-name map: the inbox stores the name in sprintId (see rowToTicket),
  // so name -> name keeps the placement rule + quick-moves resolving correctly.
  const moveSprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) if (r.sprintName) map[r.sprintName] = r.sprintName;
    return map;
  }, [rows]);

  // Shared row-actions dispatch (BRDG-374). The inbox adapter reflects only sprint moves
  // optimistically (the row carries no flag/readiness state, so field edits are
  // write-through) and never touches the board's caches.
  const adapter = useMemo(() => {
    const sprintNameForKey = (key: string): string | null => {
      const r = rows.find((x) => x.key === key);
      return r ? (key in localMoves ? localMoves[key] : r.sprintName) : null;
    };
    const dataAdapter: RowDataAdapter = {
      getTicket: (key) => { const r = rows.find((x) => x.key === key); return r ? rowToTicket(r, sprintNameForKey(key)) : undefined; },
      getTickets: () => rows.map((r) => rowToTicket(r, sprintNameForKey(r.key))),
      mutate: () => { void mutateList(); },
      activeListKey: LIST_KEY,
      sprintNameMap: moveSprintNameMap,
    };
    return makeInboxDispatchAdapter(dataAdapter, { setLocalMoves });
  }, [rows, localMoves, mutateList, moveSprintNameMap]);

  const ra = useRowActions({
    adapter,
    selectedKeys: checkedKeys,
    sprints,
    pinnedSprintIds,
    backlogTargetName,
    showToast,
    // The inbox row model does not track the real Jira flag state (rowToTicket hardcodes
    // flagged:false), so we cannot assume a row is unflagged. "mixed" offers both Flag and
    // Remove flag rather than guessing, matching adapter.ts's contract and the row-actions
    // test (BRDG-406: impl/doc/test now agree).
    flagSource: "mixed",
    currentSprintName: (key) => (key in localMoves ? localMoves[key] : (rows.find((r) => r.key === key)?.sprintName ?? null)),
    injectSprint: (sprint) =>
      mutateSprints(
        (cur) =>
          cur && !cur.sprints.some((s) => s.id === sprint.id)
            ? { ...cur, sprints: [...cur.sprints, { id: sprint.id, name: sprint.name, state: sprint.state, startDate: sprint.startDate, endDate: sprint.endDate, goal: sprint.goal }] }
            : cur,
        { revalidate: false },
      ),
  });
  const { rowMenu, quickCreate } = ra;

  // Refinement sessions for the "Add to refinement" picker, matching the board: only
  // not-completed sessions, labelled / sorted / counted exactly like /refinement.
  const { sessions: refinementSessionList, mutate: mutateRefinementSessions } = useRefinementSessions();
  const refinementOptions = useMemo(
    () =>
      (refinementSessionList ?? [])
        .filter((s) => s.status !== "completed")
        .sort(compareSessions)
        .map((s) => ({ id: s.id, name: sessionLabel(s), count: s.ticketCount })),
    [refinementSessionList],
  );
  const handleAddToRefinement = useCallback(
    async (sessionId: string, targets: Set<string>) => {
      const session = refinementSessionList?.find((s) => s.id === sessionId);
      if (!session) return;
      const keys = [...targets];
      const nextKeys = [...new Set([...session.ticketKeys, ...keys])];
      const optimistic = refinementSessionList!.map((s) => (s.id === sessionId ? { ...s, ticketKeys: nextKeys, ticketCount: nextKeys.length } : s));
      try {
        await mutateRefinementSessions(
          async () => { await refinementSessions.update(sessionId, { ticketKeys: nextKeys }); return refinementSessions.list(); },
          { optimisticData: optimistic, rollbackOnError: true, revalidate: true },
        );
        showToast(`Added ${keys.length} issue${keys.length === 1 ? "" : "s"} to "${sessionLabel(session)}"`);
      } catch {
        showToast(`Couldn't add to "${sessionLabel(session)}"`);
      }
    },
    [refinementSessionList, mutateRefinementSessions, showToast],
  );

  const {
    filteredRows,
    searchQuery,
    setSearchQuery,
    searchCount,
    sortField,
    sortDir,
    onSortChange,
    activeFilterCount,
    visibleTags,
    filterProps,
  } = useInboxFilters(rows);

  // "New" subset (BRDG-438). newCount is over the full unread list (rows) so it
  // matches the digest banner; the newOnly toggle filters the *displayed* list
  // (still within any active filter-bar filters). Initialised once from ?new=1
  // (the digest deep-link) via a lazy initializer - no effect, no ref-in-render.
  const newCount = useMemo(() => rows.filter(isNew).length, [rows, isNew]);
  const [newOnly, setNewOnly] = useState(() => searchParams.get("new") === "1");
  // When nothing is new the All/New toggle collapses to a plain total badge (see
  // the header), so a newOnly view would strand the user on an empty screen with
  // no obvious way back — most visibly when the digest deep-links to ?new=1 but
  // the new count is 0. Treat newOnly as inactive whenever the new count is zero
  // so the inbox falls back to All instead of a dead end (BRDG-453).
  const effectiveNewOnly = newOnly && newCount > 0;
  const displayRows = useMemo(
    () => (effectiveNewOnly ? filteredRows.filter(isNew) : filteredRows),
    [effectiveNewOnly, filteredRows, isNew],
  );

  // BRDG-415: prune the selection to the visible rows (see prune-selection.ts) so a row
  // dropped by a filter / refetch leaves the "N selected" count and bulk targets.
  const visibleInboxKeys = useMemo(() => new Set(displayRows.map((r) => r.key)), [displayRows]);
  const prunedCheckedKeys = pruneSelectionToVisible(checkedKeys, visibleInboxKeys);
  if (prunedCheckedKeys !== checkedKeys) setCheckedKeys(prunedCheckedKeys);

  // The right-clicked row's current epic (single target only), so the Set Epic
  // panel shows the checkmark + Unlink like the sidebar (BRDG-381).
  const rowMenuEpic = useMemo<EpicOption | null>(() => {
    if (!rowMenu || rowMenu.targets.size !== 1) return null;
    const r = filteredRows.find((x) => x.key === [...rowMenu.targets][0]);
    return r?.epic && r?.epicKey ? { key: r.epicKey, name: r.epic } : null;
  }, [rowMenu, filteredRows]);

  // Relevance grouping inputs (BRDG-372): my team, who is on each team, and who
  // the POs are. Fetched here so the inbox stays the single owner of grouping.
  const { defaultTeam } = useDefaultTeam();
  const { data: teamData } = useSWR<{ assignments: Array<{ displayName: string; teams: string[] }> }>(
    userTeams.listUrl(),
  );
  const { data: poData } = useSWR<{ pos: string[]; accountIds: string[] }>(poUsers.listUrl());

  const relevanceOptions = useMemo(
    () => ({
      myTeam: defaultTeam,
      teamMap: buildTeamMap(
        (teamData?.assignments ?? []).map((a) => ({ displayName: a.displayName, teams: a.teams as Team[] })),
      ),
      poAccountIds: new Set(poData?.accountIds ?? []),
      poNames: new Set(poData?.pos ?? []),
    }),
    [defaultTeam, teamData, poData],
  );

  // Configurable grouping over the already filtered + sorted rows, so search /
  // filter / sort still apply within each group (BRDG-358).
  const { groupBy, setGroupBy, groups, collapsedGroups, toggleCollapse } = useInboxGroupBy(
    displayRows,
    relevanceOptions,
  );

  // Identity sprint-name map so the BoardRow sprint chip shows the display name
  // (the inbox stores the name in sprintId, see rowToTicket).
  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of rows) if (r.sprintName) map[r.sprintName] = r.sprintName;
    return map;
  }, [rows]);

  // Suppress the chip that just repeats the active group's value: grouped by
  // Reporter drops the "by <name>" chip (handled by removing the creator tag);
  // Epic and Sprint are suppressed below via hideEpic / showSprint (BRDG-358).
  const rowTags = useMemo(() => {
    if (groupBy !== "creator") return visibleTags;
    const next = new Set(visibleTags);
    next.delete("creator");
    return next;
  }, [visibleTags, groupBy]);

  const { mutate: swrMutate } = useSWRConfig();
  const refreshCount = useCallback(() => void swrMutate(COUNT_KEY), [swrMutate]);

  // Restore marked-read tickets: clear their read stamp on the server, then
  // revalidate so they slot back into the list.
  const undoMarkRead = useCallback(
    async (keys: string[]) => {
      dismissToast();
      await fetch("/api/new-stories/read", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ keys, read: false }),
      });
      await mutateList();
      refreshCount();
    },
    [dismissToast, mutateList, refreshCount],
  );

  const markRead = useCallback(
    async (keys: string[]) => {
      if (keys.length === 0) return;
      const removing = new Set(keys);
      // Optimistic: drop the rows immediately so the list never stalls.
      await mutateList(
        (cur) => (cur ? { ...cur, rows: cur.rows.filter((r) => !removing.has(r.key)) } : cur),
        { revalidate: false },
      );
      setCheckedKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next;
      });
      try {
        if (keys.length === 1) {
          await fetch("/api/new-stories/read", {
            method: "PUT",
            headers: JSON_HEADERS,
            body: JSON.stringify({ key: keys[0], read: true }),
          });
        } else {
          await fetch("/api/new-stories/read", {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ keys, read: true }),
          });
        }
      } finally {
        refreshCount();
      }
      showToast(
        <span className="flex items-center gap-2">
          Marked {keys.length} as read
          <button
            type="button"
            onClick={() => void undoMarkRead(keys)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-label font-medium text-[var(--color-brand-300)] transition-colors duration-150 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          >
            <Undo2 className="h-3 w-3" strokeWidth={2} />
            Undo
          </button>
        </span>,
        6000,
      );
    },
    [mutateList, refreshCount, showToast, undoMarkRead],
  );

  // Shift-click range selection, scoped to a single group so it behaves the same
  // in every grouping mode (date / sprint / epic / creator). The anchor records
  // the last plain click; a subsequent shift-click in the same group applies that
  // click's resulting checked-state across the whole span (mirrors the board).
  const rangeAnchorRef = useRef<{ groupKey: string; index: number; checked: boolean } | null>(null);
  const handleRowCheckbox = useCallback(
    (groupKey: string, groupKeys: string[], key: string, idx: number, shiftKey: boolean) => {
      const anchor = rangeAnchorRef.current;
      if (shiftKey && anchor && anchor.groupKey === groupKey) {
        const from = Math.min(anchor.index, idx);
        const to = Math.max(anchor.index, idx);
        const rangeKeys = groupKeys.slice(from, to + 1);
        setCheckedKeys((prev) => {
          const next = new Set(prev);
          for (const k of rangeKeys) {
            if (anchor.checked) next.add(k);
            else next.delete(k);
          }
          return next;
        });
        return;
      }
      setCheckedKeys((prev) => {
        const next = new Set(prev);
        const willBeChecked = !next.has(key);
        rangeAnchorRef.current = { groupKey, index: idx, checked: willBeChecked };
        if (willBeChecked) next.add(key);
        else next.delete(key);
        return next;
      });
    },
    [],
  );

  const allChecked = displayRows.length > 0 && displayRows.every((r) => checkedKeys.has(r.key));
  const toggleAll = useCallback(() => {
    setCheckedKeys((prev) => {
      const all = displayRows.length > 0 && displayRows.every((r) => prev.has(r.key));
      return all ? new Set() : new Set(displayRows.map((r) => r.key));
    });
  }, [displayRows]);

  // Per-group select-all: toggles exactly that group's keys in the shared
  // checkedKeys set, feeding the same mark-as-read bulk action (BRDG-358).
  const toggleGroup = useCallback((groupKeys: string[]) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      const allSelected = groupKeys.every((k) => next.has(k));
      for (const k of groupKeys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  // Build the panel ticket from the in-list row so it opens without a round trip;
  // fall back to a detail fetch only if the key is no longer in the list.
  const selectedRow = rows.find((r) => r.key === selectedKey) ?? null;
  const fallback = useTicketDetail(selectedKey && !selectedRow ? selectedKey : null);
  const panelTicket: Ticket | null = selectedRow
    ? toTicket(selectedRow)
    : (fallback.data ?? null);

  return (
    <>
      {pageTitle}
      <div className="flex h-full flex-col">
        {/* Controls live in the header's actions slot (group-by · search · sort ·
            filter), so the inbox needs no separate controls bar. Notifications are
            hidden here: the inbox is a triage surface, not a place to react to alerts. */}
        <ViewHeader
          icon={<Inbox size={16} strokeWidth={1.5} />}
          hideNotifications
          actions={
            <div className="flex items-center gap-1">
              <InboxGroupByDropdown value={groupBy} onChange={setGroupBy} showRelevance={!!defaultTeam} />
              <UnifiedControlsCluster
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchCount={searchCount}
                sortField={sortField}
                sortDir={sortDir}
                onSortChange={onSortChange}
                sortOptions={INBOX_SORT_OPTIONS}
                sortDefaultField="created"
                activeFilterCount={activeFilterCount}
                filterProps={filterProps}
              />
            </div>
          }
        >
          <ViewHeaderTitle>Inbox</ViewHeaderTitle>
          {data && (
            <>
              {/* Segmented All / New filter (BRDG-441, variant A): replaces the two
                  count pills so filtering is obvious — the active segment is filled.
                  The New segment carries the brand dot + the new-since-last-cleared
                  count; the All segment the total unread. When nothing is new the
                  segmented track collapses to the plain total badge (no dead toggle). */}
              {newCount > 0 ? (
                <div
                  role="group"
                  aria-label="Filter inbox"
                  className="inline-flex items-center rounded-full bg-overlay-subtle p-0.5 text-label font-medium"
                >
                  <button
                    type="button"
                    onClick={() => setNewOnly(false)}
                    aria-pressed={!newOnly}
                    title="Show all unread"
                    className={`cursor-pointer rounded-full px-2.5 py-1 tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                      !newOnly
                        ? "bg-surface-floating text-text-primary shadow-sm"
                        : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    All {rows.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewOnly(true)}
                    aria-pressed={newOnly}
                    title="Show only new since you last cleared your inbox"
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                      newOnly
                        ? "bg-[var(--color-brand-500)] text-white"
                        : "text-[var(--color-brand-300)] hover:bg-[var(--color-brand-subtle)]"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${newOnly ? "bg-white" : "bg-current"}`} aria-hidden />
                    New {newCount}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewOnly(false)}
                  title="Show all unread"
                  className="cursor-pointer rounded-full bg-overlay-subtle px-2 py-0.5 text-label tabular-nums text-text-tertiary transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                >
                  {rows.length}
                </button>
              )}
              {/* Select all the shown set, right beside the filter so filtering AND
                  selecting both live in the header. Reuses allChecked/toggleAll over
                  displayRows: it checks exactly what is visible and clears on re-click.
                  Reads "Select all new" while the New segment is active. */}
              {displayRows.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  aria-pressed={allChecked}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-label font-medium text-text-secondary ring-1 ring-border-default transition-colors duration-150 hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                >
                  <Checkbox checked={allChecked} />
                  Select all{effectiveNewOnly ? " new" : ""}
                  <span className="tabular-nums text-text-muted">({displayRows.length})</span>
                </button>
              )}
            </>
          )}
        </ViewHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className={`flex-1 overflow-y-auto px-8 py-5 ${checkedKeys.size > 0 ? "pb-28" : ""}`}>
              <div className={CONTENT_MAX}>
                {/* A failed fetch is otherwise invisible (SWR does not throw): the
                    inbox would just look empty. Surface it as a retryable banner
                    above cached rows, or a full retry screen when nothing loaded. */}
                {error && data && (
                  <DataErrorState error={error} onRetry={() => void mutateList()} className="mb-3" />
                )}
                {error && !data ? (
                  <DataErrorState variant="full" error={error} onRetry={() => void mutateList()} className="py-24" />
                ) : isLoading && !data ? (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SkeletonRow key={i} index={i} className="h-11" />
                    ))}
                  </div>
                ) : rows.length === 0 ? (
                  <EmptyState
                    icon={<Inbox size={22} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
                    title="Inbox zero"
                    description="No unread stories. Newly created stories appear here for review; mark them as read to clear them."
                    className="py-24"
                  />
                ) : displayRows.length === 0 ? (
                  <EmptyState
                    title={effectiveNewOnly ? "No new stories since you last cleared your inbox" : "No stories match the current filters"}
                    className="py-24"
                  />
                ) : (
                  <div className="space-y-3">
                    {/* Arrived intending "new" (digest ?new=1 or the New segment)
                        but nothing is new: confirm that explicitly rather than
                        silently showing All, so the fallback is understood
                        (BRDG-453). */}
                    {newOnly && newCount === 0 && (
                      <div
                        role="status"
                        className="flex items-center gap-2 rounded-lg bg-[var(--color-brand-subtle)] px-3 py-2 text-body-sm text-text-secondary"
                      >
                        <CheckCircle2
                          size={15}
                          strokeWidth={2}
                          className="shrink-0 text-[var(--color-brand-400)]"
                          aria-hidden
                        />
                        <span>
                          No new stories since you last cleared your inbox. Showing all unread instead.
                        </span>
                      </div>
                    )}
                    {groups.map((group) => {
                      const groupKeys = group.rows.map((r) => r.key);
                      const selectAllChecked =
                        groupKeys.length > 0 && groupKeys.every((k) => checkedKeys.has(k));
                      const selectAllIndeterminate =
                        !selectAllChecked && groupKeys.some((k) => checkedKeys.has(k));
                      const isCollapsed = collapsedGroups.has(group.key);
                      return (
                        <GroupCard
                          key={group.key}
                          isCollapsed={isCollapsed}
                          onToggleCollapse={() => toggleCollapse(group.key)}
                          header={
                            <GroupStatBar
                              tickets={group.rows.map(toTicket)}
                              label={group.label}
                              labelWidthClass=""
                              showStatusCounts={false}
                              showWarnings={false}
                              showMetrics={false}
                              isCollapsed={isCollapsed}
                              onToggleCollapse={() => toggleCollapse(group.key)}
                              onSelectAll={() => toggleGroup(groupKeys)}
                              selectAllChecked={selectAllChecked}
                              selectAllIndeterminate={selectAllIndeterminate}
                              selectionActive={checkedKeys.size > 0}
                              alignSelectAllToRows
                              onMarkGroupRead={() => void markRead(groupKeys)}
                              sortField={sortField}
                              sortDir={sortDir}
                              spColumnHidden={!visibleTags.has("storyPoints")}
                              bvColumnHidden={!visibleTags.has("businessValue")}
                            />
                          }
                        >
                          <table className="w-full table-fixed border-collapse text-body-lg">
                            <tbody>
                              {group.rows.map((row, idx) => (
                                <BoardRow
                                  key={row.key}
                                  ticket={toTicket(row)}
                                  ticketIdx={idx}
                                  isChecked={checkedKeys.has(row.key)}
                                  isSelected={row.key === selectedKey}
                                  isContextTarget={rowMenu?.targets.has(row.key) ?? false}
                                  someChecked={checkedKeys.size > 0}
                                  isDragActive={false}
                                  hideRowAccent
                                  tags={rowTags}
                                  onRowContextMenu={ra.handleRowContextMenu}
                                  hideEpic={groupBy === "epic"}
                                  showSprint={groupBy !== "sprint"}
                                  sprintNameMap={sprintNameMap}
                                  selectedTicket={selectedKey}
                                  onSelectTicket={(key) => setSelectedKey(key)}
                                  onCheckboxClick={(key, clickIdx, shiftKey) =>
                                    handleRowCheckbox(group.key, groupKeys, key, clickIdx, shiftKey)
                                  }
                                  createdAtLabel={groupBy !== "date" ? relativeDate(row.jiraCreatedAt) : undefined}
                                  isNewSinceLastViewed={isNew(row)}
                                  hideEmptyAssignee
                                  onMarkRead={(key) => void markRead([key])}
                                  isLastInCard={idx === group.rows.length - 1}
                                />
                              ))}
                            </tbody>
                          </table>
                        </GroupCard>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {checkedKeys.size > 0 && (
              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-dropdown flex justify-center px-4 pb-6">
                {/* Hug the bar's content + center it, like the sprint board (no w-full). */}
                <div className="pointer-events-auto">
                  {/* Shared board bulk bar (BRDG-373) with the inbox's prominent
                      "Mark as read" as the leading primary action. */}
                  <BulkActionBar
                    floating
                    count={checkedKeys.size}
                    totalCount={displayRows.length}
                    allChecked={allChecked}
                    onToggleAll={toggleAll}
                    onClear={() => setCheckedKeys(new Set())}
                    onMarkRead={() => void markRead([...checkedKeys])}
                    markReadCount={checkedKeys.size}
                    onSetStatus={ra.bulkSetStatus}
                    onSetReadiness={ra.bulkSetReadiness}
                    onSetEpic={(epicKey) => ra.bulkSetEpic(epicKey)}
                    onMoveSprint={(sprintId) => ra.moveSprint(sprintId)}
                    quickMoves={ra.quickMovesFor(checkedKeys)}
                    currentSprintIds={ra.currentSprintIdsFor(checkedKeys)}
                    onQuickMove={ra.handleQuickMove}
                    onUpdateAssignee={ra.bulkUpdateAssignee}
                    onUpdateLabel={ra.bulkUpdateLabels}
                    onSetFlagged={(flagged) => ra.bulkSetFlagged(flagged, null)}
                    flagState={ra.computeFlagState(checkedKeys)}
                    sprints={sprints}
                    pinnedSprintIds={pinnedSprintIds}
                    onReviewStory={() => ra.handleBulkReview()}
                    onGenerateSubtasks={() => ra.handleBulkGenerate()}
                    isGeneratingSubtasks={ra.isGeneratingSubtasks}
                    onCopyToClipboard={() => ra.copySelected()}
                    refinements={refinementOptions}
                    onAddToRefinement={(id) => handleAddToRefinement(id, checkedKeys)}
                    onRefine={() => ra.openRefine([...checkedKeys])}
                  />
                </div>
              </div>
            )}
          </div>

          {selectedKey && panelTicket && (
            <SidePanel
              key={selectedKey}
              ticket={panelTicket}
              poStatus={null}
              readiness={panelTicket.readiness ?? null}
              onPoStatusChange={(v) => { void saveTicketMetadata(selectedKey, { poStatus: v }); }}
              onReadinessChange={(v) => { void saveTicketMetadata(selectedKey, { readiness: v }); }}
              onNotesChange={(notes) => { void saveTicketMetadata(selectedKey, { poNotes: notes }); }}
              onClose={() => setSelectedKey(null)}
              onShowToast={() => {}}
              onSelectTicket={setSelectedKey}
              enableBackNavigation
            />
          )}
        </div>
      </div>
      {rowMenu && (
        <CursorMenu x={rowMenu.x} y={rowMenu.y} onClose={() => ra.setRowMenu(null)}>
          <TicketActionMenuContent
            onMarkRead={() => void markRead([...rowMenu.targets])}
            onSetStatus={(s) => ra.bulkSetStatus(s, rowMenu.targets)}
            onSetReadiness={(r) => ra.bulkSetReadiness(r, rowMenu.targets)}
            onSetEpic={(epicKey) => ra.bulkSetEpic(epicKey, null, rowMenu.targets)}
            epicValue={rowMenuEpic}
            epicSuggestTicketKey={rowMenu.targets.size === 1 ? [...rowMenu.targets][0] : undefined}
            epicClearable={rowMenu.targets.size > 1}
            onMoveSprint={(sprintId) => ra.moveSprint(sprintId, rowMenu.targets)}
            quickMoves={ra.quickMovesFor(rowMenu.targets)}
            currentSprintIds={ra.currentSprintIdsFor(rowMenu.targets)}
            onQuickMove={(opt) => ra.handleQuickMove(opt, rowMenu.targets)}
            onUpdateAssignee={(accountId, name, avatar) => ra.bulkUpdateAssignee(accountId, name, avatar, rowMenu.targets)}
            onUpdateLabel={(labels, mode) => ra.bulkUpdateLabels(labels, mode, rowMenu.targets)}
            onSetFlagged={(flagged) => ra.bulkSetFlagged(flagged, null, rowMenu.targets)}
            flagState={ra.computeFlagState(rowMenu.targets)}
            onReviewStory={() => ra.handleBulkReview(rowMenu.targets)}
            onGenerateSubtasks={() => ra.handleBulkGenerate(rowMenu.targets)}
            refinements={refinementOptions}
            onAddToRefinement={(id) => handleAddToRefinement(id, rowMenu.targets)}
            onRefine={() => ra.openRefine([...rowMenu.targets])}
            sprints={sprints}
            pinnedSprintIds={pinnedSprintIds}
            close={() => ra.setRowMenu(null)}
          />
        </CursorMenu>
      )}

      <AddToRefinementModal
        open={ra.refineModalOpen}
        onClose={() => ra.setRefineModalOpen(false)}
        ticketKeys={ra.refineKeys}
        onAdded={(_id, name) =>
          showToast(`Added ${ra.refineKeys.length} issue${ra.refineKeys.length === 1 ? "" : "s"} to "${name}"`)
        }
      />

      {quickCreate && (
        <CreateSprintModal
          onClose={ra.closeQuickCreate}
          onCreated={ra.confirmQuickCreate}
          showToast={showToast}
          suggestedName={quickCreate.name}
          suggestedStartDate={startDateFromPreviousEnd(ra.planPrevSprint?.endDate)}
          previousSprintName={ra.planPrevSprint?.name}
          previousSprintEndIso={ra.planPrevSprint?.endDate ?? null}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}

// useSearchParams (digest deep-link ?new=1) requires a Suspense boundary in the
// App Router, so the page body lives in InboxView and the route wraps it.
export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxView />
    </Suspense>
  );
}
