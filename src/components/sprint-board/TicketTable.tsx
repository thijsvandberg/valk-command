"use client";

import { useState, useRef, useCallback, useMemo, useEffect, type ReactNode } from "react";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus, Sprint, PlaceholderTicket } from "@/types/ticket";
import { PlaceholderRow } from "@/components/sprint-board/PlaceholderRow";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import type { SortField, SortDir, InlineTagId } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { ChildIssueComposer } from "@/components/ticket-detail/ChildIssueComposer";
import { Sheet, Inbox, Plus } from "lucide-react";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { matchesWarningFilter, ticketWarningLabels } from "@/components/sprint-board/warning-filter";
import { GroupCard, GROUP_CARD_CLASS } from "@/components/sprint-board/GroupCard";
import { trailingDoneDepStart } from "@/lib/sprint-insert-position";
import type { TicketGroup, GroupByOption } from "@/components/sprint-board/useGroupBy";
import type { GroupSyncTarget, GroupSyncProgress, GroupSyncResult } from "@/lib/group-sync";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BoardRow, SortableBoardRow } from "@/components/sprint-board/BoardRow";
import type { TicketSessionEntry } from "@/hooks/useTicketSessionMap";
import type { RefinementCardTicketInfo } from "@/components/sprint-board/RefinementGemHoverCard";
import { useFollowedTickets, useFollowTicket, useLastDeployed, usePipelineHealth } from "@/hooks/usePipelines";
import { POStatusCell, QualityBadge, POStatusIcon, EditStateDot, getJiraUrl } from "@/components/sprint-board/TicketTableCells";

export { POStatusCell, QualityBadge, POStatusIcon, EditStateDot, getJiraUrl };

// Stable defaults for optional props, avoids creating new references on each render
const EMPTY_STRING_MAP: Record<string, string> = {};
const EMPTY_READINESS_MAP: Record<string, TicketReadiness | null> = {};
const NOOP = () => {};

// Headerless board: every row is a single flex cell, so group header / spacer / drop-zone
// rows span exactly one column (BRDG-239).
const TOTAL_COLSPAN = 1;

// Elevated surface for the ungrouped list. Grouped cards use the shared GroupCard
// component so the board and the epic "By sprint" view stay visually in sync.
const CARD_CLASS = GROUP_CARD_CLASS;

// Droppable zone rendered inside empty sprint groups during an active drag.
function DroppableGroupZone({ groupKey }: { groupKey: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-zone:${groupKey}`,
    data: { type: "group-zone", sprintId: groupKey },
  });
  return (
    <tr ref={setNodeRef}>
      <td colSpan={TOTAL_COLSPAN} className={`transition-colors duration-150 ${isOver ? "bg-[var(--color-brand-500)]/[0.04]" : ""}`}>
        <div className={`mx-3 my-2 flex h-8 items-center justify-center rounded border border-dashed text-body-sm transition-colors duration-150 ${
          isOver
            ? "border-[var(--color-brand-500)]/40 text-[var(--color-brand-300)]"
            : "border-border-default text-text-muted"
        }`}>
          Drop to move to this sprint
        </div>
      </td>
    </tr>
  );
}

// A collapsed group unmounts its table (and the empty-group drop zone with it), so the
// header card itself becomes the drop target during an external drag. The brand ring + tint
// make the otherwise-static header read as a live target so the drop feels intentional.
function CollapsedGroupDroppable({ groupKey, children }: { groupKey: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-zone:${groupKey}`,
    data: { type: "group-zone", sprintId: groupKey },
  });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl [transition:box-shadow_.12s_ease] ${
        isOver ? "shadow-[0_0_0_2px_var(--color-brand-500)]" : ""
      }`}
    >
      {children}
    </div>
  );
}

const VIRTUALIZE_THRESHOLD = 40;
// Line-less py-3 rows measure ~44px; the virtualizer still measures real heights, this is
// only the pre-measurement estimate (BRDG-239 "B+C").
const ROW_HEIGHT_ESTIMATE = 44;
const VIRTUALIZER_OVERSCAN = 20;

export function TicketTable({
  tickets,
  checkedTickets,
  selectedTicket,
  focusedTicketIdx,
  someChecked,
  allChecked: _allChecked,
  visibleTags,
  hideEpic = false,
  showSprint = false,
  sprintNameMap,
  poStatuses,
  readinessMap,
  inflightKeys,
  onToggleCheck,
  onRangeCheck,
  onToggleAll: _onToggleAll,
  onSelectTicket,
  onRowContextMenu,
  contextMenuKeys,
  onPoStatusChange,
  onReadinessChange,
  onBusinessValueChange,
  onStoryPointsChange,
  planningOn = false,
  onGuestimationChange,
  pencilCapacityMap,
  onPencilCapacityChange,
  sprintUsedMap,
  onJiraStatusChange,
  onIssueTypeChange,
  onTitleChange,
  onAssigneeChange,
  onEpicChange,
  onSprintChange,
  sprints,
  onCloseSubtasks,
  onTableKeyDown,
  onReorder,
  onRunReview,
  sortField,
  sortDir,
  externalDnd,
  externalActiveDragId,
  dragOverKey,
  groups,
  collapsedGroups,
  onToggleCollapse,
  groupBy,
  pinnedSprintIds,
  onPinSprint,
  onEditSprint,
  onCloseSprint,
  onSyncGroup,
  flatHeader,
  scrollContainerRef,
  refinementSessionMap,
  onRemoveFromRefinement,
  onViewRefinement,
  onCreateTicket,
  flatCreateTarget,
  flatComposerOpen = false,
  onCloseFlatComposer,
  warningLensActive = false,
  warningLensActiveSprint = false,
  filterSignature,
  placeholders,
  onPlaceholderUpdate,
  onPlaceholderDelete,
  onPlaceholderPromote,
  onPlaceholderCreate,
}: {
  tickets: Ticket[];
  checkedTickets: Set<string>;
  selectedTicket: string | null;
  focusedTicketIdx: number;
  someChecked: boolean;
  allChecked: boolean;
  visibleTags: Set<InlineTagId>;
  /** Suppress the epic chip on every row (e.g. when grouped by epic). */
  hideEpic?: boolean;
  /** Show the sprint name on each row (when multiple sprints are visible). */
  showSprint?: boolean;
  sprintNameMap?: Record<string, string>;
  poStatuses: Record<string, POStatus>;
  readinessMap?: Record<string, TicketReadiness | null>;
  inflightKeys?: Set<string>;
  onToggleCheck: (key: string) => void;
  onRangeCheck: (keys: string[], checked: boolean) => void;
  onToggleAll: () => void;
  onSelectTicket: (key: string | null) => void;
  onRowContextMenu?: (key: string, e: React.MouseEvent) => void;
  /** Keys the open row context menu will act on; highlighted while the menu is open. */
  contextMenuKeys?: Set<string>;
  onPoStatusChange: (key: string, status: POStatus) => void;
  onReadinessChange?: (key: string, readiness: TicketReadiness | null) => void;
  onBusinessValueChange?: (key: string, value: number | null) => void;
  onStoryPointsChange?: (key: string, value: number | null) => void;
  /** Forward-planning mode (BRDG-303): reveals the guestimation picker on unestimated rows
   *  and the fullness meter on sprint group headers. */
  planningOn?: boolean;
  onGuestimationChange?: (key: string, value: number | null) => void;
  /** sprintId -> pencil capacity, for the fullness meter on sprint group headers. */
  pencilCapacityMap?: Record<string, number>;
  onPencilCapacityChange?: (sprintId: string, value: number | null) => void;
  /** sprintId -> total effective points across the WHOLE sprint, so the fullness meter
   *  is filter-independent (BRDG-303). */
  sprintUsedMap?: Record<string, number>;
  onJiraStatusChange?: (key: string, status: JiraStatus) => void;
  onIssueTypeChange?: (key: string, type: IssueType) => void;
  onTitleChange?: (key: string, title: string) => void;
  onAssigneeChange?: (key: string, user: AssignableUser | null) => void;
  onEpicChange?: (key: string, epic: EpicOption | null) => void;
  onSprintChange?: (key: string, sprintId: string | null) => void;
  sprints?: Sprint[];
  onCloseSubtasks?: (key: string) => Promise<void>;
  onTableKeyDown: (e: React.KeyboardEvent) => void;
  onReorder?: (activeKey: string, overKey: string) => void;
  /** Request a quality review for a ticket (surfaced in the hover card when unscored). */
  onRunReview?: (key: string) => void | Promise<void>;
  // Sort is driven entirely by the FilterBar dropdown (BRDG-239); the table keeps
  // sortField/sortDir only to reset the virtualizer scroll position on change.
  sortField?: SortField;
  sortDir?: SortDir;
  // When true, DndContext is owned by a parent component (SprintBoard).
  // The table only renders SortableContext; no internal DndContext or DragOverlay.
  externalDnd?: boolean;
  externalActiveDragId?: string | null;
  // Key of the ticket currently being hovered over during external drag (for insertion line).
  dragOverKey?: string | null;
  // Grouped rendering: when groups are provided, render per-group tbodies with headers.
  groups?: TicketGroup[];
  collapsedGroups?: Set<string>;
  onToggleCollapse?: (groupKey: string) => void;
  groupBy?: GroupByOption;
  // Rendered at the top of the flat (ungrouped) card — the single-sprint/backlog
  // stat header (BRDG card header). Only shown when not grouped.
  flatHeader?: ReactNode;
  // When grouping by sprint, pin a sprint group to the tab bar. Key is the sprint id.
  pinnedSprintIds?: Set<string>;
  onPinSprint?: (sprintId: string) => void;
  // When grouping by sprint, open the goal/dates editor or close (finish) a sprint group. Key is the sprint id.
  onEditSprint?: (sprintId: string) => void;
  onCloseSprint?: (sprintId: string) => void;
  // Runs a tranched Jira sync of a whole sprint or epic group, reporting progress.
  onSyncGroup?: (target: GroupSyncTarget, onProgress: (p: GroupSyncProgress) => void) => Promise<GroupSyncResult>;
  // When provided, the table uses this as its scroll container (for shared scroll with analytics).
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  refinementSessionMap?: Map<string, TicketSessionEntry[]>;
  /** Remove a ticket from a refinement session (from the gem hover card). */
  onRemoveFromRefinement?: (sessionId: string, ticketKey: string) => void;
  /** Navigate to a refinement session (from the gem hover card). */
  onViewRefinement?: (sessionId: string) => void;
  /** Create a story/task/bug into a sprint (id), or the backlog (null). Enables the inline composer. */
  onCreateTicket?: (sprintId: string | null, title: string, jiraType: string) => void;
  /** Target for the ungrouped list's composer. When set, the header "+" can open the inline composer. */
  flatCreateTarget?: { sprintId: string | null };
  /** Whether the flat (single-sprint) composer is open. Toggled by the "+" in the single-sprint header. */
  flatComposerOpen?: boolean;
  /** Close the flat composer (Escape on an empty input). */
  onCloseFlatComposer?: () => void;
  // Warning filter mode for the FLAT single-sprint view (BRDG-313): when active, the
  // already-narrowed `tickets` get per-row hygiene labels. warningLensActiveSprint gates
  // the unpointed label (only meaningful on the active sprint). The grouped view drives
  // its own labels off the per-group warning criterion instead.
  warningLensActive?: boolean;
  warningLensActiveSprint?: boolean;
  // A stable signature of the global filters; when it changes, any active per-group
  // warning/status filter is cleared so the warning mode never leaves a stale narrowing.
  filterSignature?: string;
  // Forward-planning placeholders (BRDG-304): active placeholders in scope. Grouped
  // by sprint they bucket into each group by sprintId; in the flat single-sprint view
  // they all render below the tickets. Shown only when planning mode is on (the parent
  // gates the fetch), as their own dashed/ghosted rows.
  placeholders?: PlaceholderTicket[];
  onPlaceholderUpdate?: (id: string, patch: Partial<PlaceholderTicket>) => void;
  onPlaceholderDelete?: (id: string) => void;
  onPlaceholderPromote?: (id: string) => void;
  /** Create a placeholder with a title into a sprint (id) or the backlog (null). Wired
   *  to the create composer's "Placeholder" type option when planning is on. */
  onPlaceholderCreate?: (sprintId: string | null, title: string) => void;
}) {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sibling lookup for the gem hover card, built from the already-loaded board
  // tickets so its pills paint without an extra fetch (BRDG-265).
  const ticketInfoMap = useMemo(() => {
    const map = new Map<string, RefinementCardTicketInfo>();
    for (const t of tickets) {
      map.set(t.key, {
        title: t.title,
        type: t.type,
        jiraStatus: t.jiraStatus,
        readiness: readinessMap?.[t.key] ?? null,
      });
    }
    return map;
  }, [tickets, readinessMap]);

  // Hoisted pipeline/follow hooks: fetched once instead of per-row
  const { data: followedKeys } = useFollowedTickets();
  const { follow: followTicket, unfollow: unfollowTicket } = useFollowTicket();
  const { data: lastDeployedMap } = useLastDeployed();
  const { data: healthMap } = usePipelineHealth();

  const lastCheckRef = useRef<{ idx: number; checked: boolean } | null>(null);

  const [groupFilter, setGroupFilter] = useState<{ groupKey: string; criterion: "todo" | "in-progress" | "test" | "done" | "unpointed" } | null>(null);

  // Changing any global filter exits a per-group warning/status narrowing so the mode
  // never restores onto a stale set (BRDG-313, req 3). Mirrors the flat-view lens exit.
  useEffect(() => {
    setGroupFilter(null);
  }, [filterSignature]);

  // Inline create composer: the flat (single-sprint) list shows it inline at all
  // times; grouped sprints reveal it per group via the header "+", one at a time.
  const [composerGroupKey, setComposerGroupKey] = useState<string | null>(null);

  const [internalActiveDragId, setInternalActiveDragId] = useState<string | null>(null);
  const activeDragId = externalDnd ? externalActiveDragId ?? null : internalActiveDragId;
  const [reviewPopoverKey, setReviewPopoverKey] = useState<string | null>(null);
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);

  const handleToggleReviewPopover = useCallback((key: string) => {
    setReviewPopoverKey((prev) => (prev === key ? null : key));
  }, []);

  const handleCheckboxClick = useCallback((key: string, idx: number, shiftKey: boolean) => {
    const anchor = lastCheckRef.current;
    if (shiftKey && anchor !== null) {
      const from = Math.min(anchor.idx, idx);
      const to = Math.max(anchor.idx, idx);
      const rangeKeys = tickets.slice(from, to + 1).map((t) => t.key);
      onRangeCheck(rangeKeys, anchor.checked);
    } else {
      const willBeChecked = !checkedTickets.has(key);
      lastCheckRef.current = { idx, checked: willBeChecked };
      onToggleCheck(key);
    }
  }, [tickets, checkedTickets, onToggleCheck, onRangeCheck]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setInternalActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setInternalActiveDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id && onReorder) {
      onReorder(active.id as string, over.id as string);
    }
  }, [onReorder]);

  // The flat composer is injected as a real row at the insertion index, which the virtualizer's
  // uniform-index math cannot accommodate; render non-virtualized while it is open (BRDG-315).
  const flatComposerActive = !!(flatCreateTarget && onCreateTicket && flatComposerOpen);
  const enableVirtualization = tickets.length > VIRTUALIZE_THRESHOLD && !flatComposerActive;
  const ticketIds = tickets.map((t) => t.key);
  const activeTicket = activeDragId ? tickets.find((t) => t.key === activeDragId) : null;

  const effectiveScrollRef = scrollContainerRef ?? tableContainerRef;

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: enableVirtualization ? tickets.length : 0,
    getScrollElement: () => effectiveScrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: VIRTUALIZER_OVERSCAN,
    measureElement: (el) => el.getBoundingClientRect().height,
    // When using an external scroll container, account for content above the table
    scrollMargin: scrollContainerRef ? (tableContainerRef.current?.offsetTop ?? 0) : 0,
  });

  // Reset scroll position when sort or filter changes
  const prevSortRef = useRef({ sortField, sortDir, ticketCount: tickets.length });
  if (enableVirtualization &&
    (prevSortRef.current.sortField !== sortField ||
     prevSortRef.current.sortDir !== sortDir ||
     prevSortRef.current.ticketCount !== tickets.length)) {
    prevSortRef.current = { sortField, sortDir, ticketCount: tickets.length };
    rowVirtualizer.scrollToIndex(0);
  }

  const virtualRows = enableVirtualization ? rowVirtualizer.getVirtualItems() : [];
  const scrollMarginValue = scrollContainerRef ? (tableContainerRef.current?.offsetTop ?? 0) : 0;
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMarginValue : 0;
  const paddingBottom = virtualRows.length > 0
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const makeRowProps = useCallback((ticket: Ticket, ticketIdx: number) => ({
    ticket,
    ticketIdx,
    isChecked: checkedTickets.has(ticket.key),
    isSelected: selectedTicket === ticket.key,
    isFocused: focusedTicketIdx === ticketIdx,
    isInflight: inflightKeys?.has(ticket.key) ?? false,
    isContextTarget: contextMenuKeys?.has(ticket.key) ?? false,
    someChecked,
    isDragActive: activeDragId !== null,
    tags: visibleTags,
    hideEpic,
    showSprint,
    sprintNameMap: sprintNameMap ?? EMPTY_STRING_MAP,
    poStatuses,
    readinessMap: readinessMap ?? EMPTY_READINESS_MAP,
    followedKeys,
    followTicket,
    unfollowTicket,
    lastDeployedMap,
    healthMap,
    selectedTicket,
    onSelectTicket,
    onRowContextMenu,
    onCheckboxClick: handleCheckboxClick,
    onPoStatusChange,
    onReadinessChange: onReadinessChange ?? NOOP,
    onBusinessValueChange,
    onStoryPointsChange,
    planningOn,
    onGuestimationChange,
    onJiraStatusChange,
    onIssueTypeChange,
    onTitleChange,
    onAssigneeChange,
    onEpicChange,
    onSprintChange,
    sprints,
    onCloseSubtasks,
    editingTitleKey,
    onEditingTitleKeyChange: setEditingTitleKey,
    reviewPopoverKey,
    onToggleReviewPopover: handleToggleReviewPopover,
    onRunReview,
    refinementSessions: refinementSessionMap?.get(ticket.key),
    ticketInfoMap,
    onRemoveFromRefinement,
    onViewRefinement,
  }), [checkedTickets, selectedTicket, focusedTicketIdx, someChecked, activeDragId, visibleTags, hideEpic, showSprint, sprintNameMap, poStatuses, readinessMap, inflightKeys, contextMenuKeys, onSelectTicket, onRowContextMenu, handleCheckboxClick, onPoStatusChange, onReadinessChange, onBusinessValueChange, onStoryPointsChange, planningOn, onGuestimationChange, onJiraStatusChange, onIssueTypeChange, onTitleChange, onAssigneeChange, onEpicChange, onSprintChange, sprints, onCloseSubtasks, editingTitleKey, reviewPopoverKey, handleToggleReviewPopover, onRunReview, followedKeys, followTicket, unfollowTicket, lastDeployedMap, healthMap, refinementSessionMap, ticketInfoMap, onRemoveFromRefinement, onViewRefinement]);

  // Placeholder rows (BRDG-304) render inside a table tbody as a single-cell row,
  // mirroring BoardRow's <tr><td> shape so they sit in the same column flow.
  const renderPlaceholderRows = useCallback(
    (list: PlaceholderTicket[], opts: { lastIdx?: number } = {}) =>
      list.map((p, idx) => (
        <tr key={p.id}>
          <td className="p-0">
            <PlaceholderRow
              placeholder={p}
              showSprint={showSprint}
              sprintNameMap={sprintNameMap ?? EMPTY_STRING_MAP}
              reserveCheckboxGutter
              onUpdate={onPlaceholderUpdate ?? NOOP}
              onDelete={onPlaceholderDelete ?? NOOP}
              onPromote={onPlaceholderPromote ?? NOOP}
              isLastInCard={idx === (opts.lastIdx ?? list.length - 1)}
            />
          </td>
        </tr>
      )),
    [showSprint, sprintNameMap, onPlaceholderUpdate, onPlaceholderDelete, onPlaceholderPromote],
  );

  const virtualizedTable = (
    <table className="w-full table-fixed border-collapse text-body-lg">
      <tbody>
        {paddingTop > 0 && (
          <tr><td style={{ height: paddingTop, padding: 0, border: "none" }} /></tr>
        )}
        {virtualRows.map((virtualRow) => {
          const ticket = tickets[virtualRow.index];
          return (
            <BoardRow
              key={ticket.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              {...makeRowProps(ticket, virtualRow.index)}
              isLastInCard={virtualRow.index === tickets.length - 1}
              warningLabels={warningLensActive ? ticketWarningLabels(ticket, warningLensActiveSprint) : undefined}
            />
          );
        })}
        {paddingBottom > 0 && (
          <tr><td style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
        )}
      </tbody>
    </table>
  );

  // The flat (single-sprint) create row, rendered at the insertion point: just above the trailing
  // contiguous done/deprecated block so the PO sees where the new story will land (BRDG-315).
  const flatInsertIdx = flatComposerActive ? trailingDoneDepStart(tickets) : -1;
  // When the composer is appended after the last ticket it becomes the visual last row, so
  // the last ticket should not round its bottom corners (the card edge sits below the composer).
  const flatComposerAtEnd = flatComposerActive && flatInsertIdx === tickets.length;
  const flatComposerRow = flatComposerActive ? (
    <tr key="__flat_composer__">
      <td className="p-0">
        <ChildIssueComposer
          variant="bar"
          autoFocus
          onCreate={(title, jiraType) => onCreateTicket!(flatCreateTarget!.sprintId, title, jiraType)}
          onEscapeEmpty={onCloseFlatComposer}
          placeholder={flatCreateTarget!.sprintId === null ? "Create story in the backlog..." : "Create story in this sprint..."}
          allowPlaceholder={!!onPlaceholderCreate}
          onCreatePlaceholder={onPlaceholderCreate ? (t) => onPlaceholderCreate(flatCreateTarget!.sprintId, t) : undefined}
          // Bleed 2px left to cover the table's collapsed-border inset (from BoardRow's left
          // selection border) so the tinted strip is flush with the card edge (BRDG-315).
          className="-ml-0.5"
        />
      </td>
    </tr>
  ) : null;

  const plainTable = (
    <table className="w-full table-fixed border-collapse text-body-lg">
      <tbody>
        {tickets.flatMap((ticket, ticketIdx) => {
          const row = (
            <BoardRow
              key={ticket.key}
              {...makeRowProps(ticket, ticketIdx)}
              isLastInCard={ticketIdx === tickets.length - 1 && !flatComposerAtEnd}
              warningLabels={warningLensActive ? ticketWarningLabels(ticket, warningLensActiveSprint) : undefined}
            />
          );
          return ticketIdx === flatInsertIdx ? [flatComposerRow, row] : [row];
        })}
        {flatInsertIdx === tickets.length && flatComposerRow}
      </tbody>
    </table>
  );

  const activeInsertIdx = externalActiveDragId ? tickets.findIndex((t) => t.key === externalActiveDragId) : -1;
  const overInsertIdx = dragOverKey ? tickets.findIndex((t) => t.key === dragOverKey) : -1;

  // When externalDnd, rows must not shift during drag. undefined falls back to
  // dnd-kit's default rectSortingStrategy, which still moves items. A null-returning
  // function is the correct way to opt out of all position transforms.
  const sortableTableBody = (
    <SortableContext items={ticketIds} strategy={externalDnd ? () => null : verticalListSortingStrategy}>
      <tbody>
        {tickets.flatMap((ticket, ticketIdx) => {
          let insertLine: "above" | "below" | undefined;
          if (dragOverKey && ticket.key === dragOverKey && activeInsertIdx !== -1 && overInsertIdx !== -1) {
            insertLine = activeInsertIdx > overInsertIdx ? "above" : "below";
          }
          const row = (
            <SortableBoardRow
              key={ticket.key}
              {...makeRowProps(ticket, ticketIdx)}
              insertLine={insertLine}
              isLastInCard={ticketIdx === tickets.length - 1 && !flatComposerAtEnd}
              warningLabels={warningLensActive ? ticketWarningLabels(ticket, warningLensActiveSprint) : undefined}
            />
          );
          return ticketIdx === flatInsertIdx ? [flatComposerRow, row] : [row];
        })}
        {flatInsertIdx === tickets.length && flatComposerRow}
      </tbody>
    </SortableContext>
  );

  // When externalDnd is true, DndContext + DragOverlay are owned by SprintBoard.
  // We only render SortableContext here so ticket rows register with the parent context.
  const dndTable = externalDnd ? (
    <table className="w-full table-fixed border-collapse text-body-lg">
      {sortableTableBody}
    </table>
  ) : (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <table className="w-full table-fixed border-collapse text-body-lg">
        {sortableTableBody}
      </table>
      <DragOverlay>
        {activeTicket && (
          <table className="w-full border-collapse text-body-lg">
            <tbody>
              <tr className="bg-[var(--color-surface-elevated)] shadow-[var(--shadow-lg)] rounded-lg border border-border-strong">
                <td className="p-0">
                  <div className="flex items-center gap-2 py-2 pl-2 pr-3">
                    <IssueTypeIcon type={activeTicket.type} />
                    <span className="font-mono text-body-sm text-text-secondary">{activeTicket.key}</span>
                    <span className="truncate text-text-primary">{activeTicket.title}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </DragOverlay>
    </DndContext>
  );

  // Grouped layout: one <tbody> per group with a header row and ticket rows.
  // Virtualization is disabled when groups are active since multiple tbodies are incompatible with virtual row indices.
  const isGrouped = groups && groups.length > 0;

  // Sprint ids that are currently running, surfaced as a live dot on the group header.
  const activeSprintIds = new Set((sprints ?? []).filter((s) => s.state === "active").map((s) => s.id));

  const groupedTable = isGrouped ? (
    // Each group is its own elevated card on the recessed base background, separated by the
    // flex gap, so consecutive sprints read as distinct sections (BRDG-239).
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups?.has(group.key) ?? false;
        const isSprintGroup = groupBy === "sprint" && group.key !== "__backlog__";
        const isBacklogGroup = groupBy === "sprint" && group.key === "__backlog__";
        const groupSprint = isSprintGroup ? sprints?.find((s) => s.id === group.key) : undefined;

        // A real sprint or epic group can be synced from Jira in tranches. The backlog
        // and the "no epic" bucket have no Jira container, so they get no sync action.
        const isEpicGroup = groupBy === "epic" && group.key !== "__none__";
        const epicKey = isEpicGroup ? group.tickets.find((t) => t.epicKey)?.epicKey ?? null : null;
        const syncTarget: GroupSyncTarget | null = groupSprint
          ? { kind: "sprint", id: group.key, label: group.label }
          : epicKey
            ? { kind: "epic", id: epicKey, label: group.label }
            : null;
        const groupSyncHandler = onSyncGroup && syncTarget
          ? (onProgress: (p: GroupSyncProgress) => void) => onSyncGroup(syncTarget, onProgress)
          : undefined;

        // Creating into a group only makes sense when grouped by sprint: the backlog
        // (no sprint) or any non-closed sprint. Jira rejects creating into closed sprints.
        const canCreateInGroup =
          !!onCreateTicket && (isBacklogGroup || (!!groupSprint && groupSprint.state !== "closed"));
        const createTargetSprintId = isBacklogGroup ? null : group.key;
        const isComposerOpen = composerGroupKey === group.key;

        const activeCriterion = groupFilter?.groupKey === group.key ? groupFilter.criterion : null;
        // While this group's warning mode is on, each row gets its own hygiene labels
        // (BRDG-313), gated by whether the group is the active sprint for the unpointed kind.
        const groupIsActiveSprint = groupBy === "sprint" && activeSprintIds.has(group.key);
        const showGroupWarningLabels = activeCriterion === "unpointed";
        const visibleGroupTickets = activeCriterion === "todo"
          ? group.tickets.filter((t) => t.jiraStatus === "TO DO")
          : activeCriterion === "in-progress"
            ? group.tickets.filter((t) => t.jiraStatus === "IN PROGRESS")
            : activeCriterion === "test"
              ? group.tickets.filter((t) => t.jiraStatus === "TEST")
              : activeCriterion === "done"
                ? group.tickets.filter((t) => t.jiraStatus === "DONE")
                : activeCriterion === "unpointed"
                  ? group.tickets.filter((t) =>
                      matchesWarningFilter(t, groupBy === "sprint" && activeSprintIds.has(group.key)))
                  : group.tickets;

        function toggleGroupFilter(criterion: "todo" | "in-progress" | "test" | "done" | "unpointed") {
          setGroupFilter((prev) =>
            prev?.groupKey === group.key && prev.criterion === criterion
              ? null
              : { groupKey: group.key, criterion },
          );
        }

        const groupTicketIds = visibleGroupTickets.map((t) => t.key);

        // Forward-planning placeholders bucket into their sprint group (BRDG-304).
        // Only when grouped by sprint; backlog placeholders map null -> "__backlog__".
        // A warning/status narrowing hides them (they are neither a status nor pointed).
        const groupPlaceholders =
          (isSprintGroup || isBacklogGroup) && !activeCriterion
            ? (placeholders ?? []).filter((p) => (p.sprintId ?? "__backlog__") === group.key)
            : [];
        const hasPlaceholders = groupPlaceholders.length > 0;

        const ticketRows = !isCollapsed && visibleGroupTickets.map((ticket, groupIdx) => {
          const flatIdx = tickets.findIndex((t) => t.key === ticket.key);
          let insertLine: "above" | "below" | undefined;
          if (dragOverKey && ticket.key === dragOverKey && activeInsertIdx !== -1 && overInsertIdx !== -1) {
            insertLine = activeInsertIdx > overInsertIdx ? "above" : "below";
          }
          const warningLabels = showGroupWarningLabels
            ? ticketWarningLabels(ticket, groupIsActiveSprint)
            : undefined;
          // Last row of the group's table rounds its bottom corners to the card edge. When
          // placeholders follow the tickets, the last placeholder rounds instead, so a ticket
          // is never the visual final row in that case.
          const isLastInCard = groupIdx === visibleGroupTickets.length - 1 && !hasPlaceholders;
          return externalDnd ? (
            <SortableBoardRow
              key={ticket.key}
              {...makeRowProps(ticket, flatIdx)}
              insertLine={insertLine}
              isLastInCard={isLastInCard}
              warningLabels={warningLabels}
            />
          ) : (
            <BoardRow
              key={ticket.key}
              {...makeRowProps(ticket, flatIdx)}
              isLastInCard={isLastInCard}
              warningLabels={warningLabels}
            />
          );
        });

        const groupRows = externalDnd ? (
          <SortableContext items={groupTicketIds} strategy={() => null}>
            {ticketRows}
            {!isCollapsed && group.tickets.length === 0 && (
              <DroppableGroupZone groupKey={group.key} />
            )}
          </SortableContext>
        ) : ticketRows;

        // Always-on create action, sized to match the warning/menu icons so the
        // header cluster reads as "warning | + | ...".
        const createAction = canCreateInGroup ? (
          <button
            type="button"
            aria-label={`Create story in ${group.label}`}
            onClick={(e) => {
              e.stopPropagation();
              setComposerGroupKey((cur) => (cur === group.key ? null : group.key));
              if (collapsedGroups?.has(group.key)) onToggleCollapse?.(group.key);
            }}
            className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] [transition:background-color_.12s_ease,color_.12s_ease] ${
              isComposerOpen
                ? "bg-overlay-strong text-text-secondary"
                : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
            }`}
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
          </button>
        ) : undefined;

        const card = (
          <GroupCard
            key={group.key}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => onToggleCollapse?.(group.key)}
            header={
              <GroupStatBar
                tickets={group.tickets}
                label={group.label}
                // Collapse the label zone to its own width so the item count sits
                // tight against each group name instead of leaving dead space
                // before a fixed-width alignment column.
                labelWidthClass=""
                createAction={createAction}
                leadingIcon={group.key === "__backlog__" ? <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} /> : undefined}
                isActive={groupBy === "sprint" && activeSprintIds.has(group.key)}
                activeCriterion={activeCriterion}
                onFilterChange={(criterion) => {
                  if (criterion === null) {
                    setGroupFilter(null);
                  } else {
                    toggleGroupFilter(criterion);
                  }
                }}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => onToggleCollapse?.(group.key)}
                {...(isSprintGroup && onPinSprint
                  ? {
                      onPin: () => onPinSprint(group.key),
                      isPinned: pinnedSprintIds?.has(group.key) ?? false,
                      pinDisabled: (pinnedSprintIds?.size ?? 0) >= 8,
                    }
                  : {})}
                {...(groupSprint
                  ? {
                      sprint: groupSprint,
                      onEditSprintDetails: onEditSprint ? () => onEditSprint(group.key) : undefined,
                      onCloseSprint: onCloseSprint && groupSprint.state === "active" ? () => onCloseSprint(group.key) : undefined,
                    }
                  : {})}
                {...(groupSyncHandler && syncTarget
                  ? { onSync: groupSyncHandler, syncKind: syncTarget.kind }
                  : {})}
                {...(isSprintGroup && planningOn && onPencilCapacityChange
                  ? {
                      planningOn: true,
                      pencilCapacity: pencilCapacityMap?.[group.key] ?? null,
                      onPencilCapacityChange: (v: number | null) => onPencilCapacityChange(group.key, v),
                      // Always the whole sprint, independent of the active filter.
                      usedPointsOverride: sprintUsedMap?.[group.key] ?? 0,
                    }
                  : {})}
              />
            }
          >
            <table className="w-full table-fixed border-collapse text-body-lg">
              <tbody>
                {groupRows}
                {!isCollapsed && hasPlaceholders && renderPlaceholderRows(groupPlaceholders)}
              </tbody>
            </table>
            {isComposerOpen && canCreateInGroup && onCreateTicket && (
              <ChildIssueComposer
                variant="bar"
                autoFocus
                onCreate={(title, jiraType) => onCreateTicket(createTargetSprintId, title, jiraType)}
                onEscapeEmpty={() => setComposerGroupKey(null)}
                placeholder={isBacklogGroup ? "Create story in the backlog..." : `Create story in ${group.label}...`}
                allowPlaceholder={!!onPlaceholderCreate}
                onCreatePlaceholder={onPlaceholderCreate ? (t) => onPlaceholderCreate(createTargetSprintId, t) : undefined}
              />
            )}
          </GroupCard>
        );

        return externalDnd && isCollapsed ? (
          <CollapsedGroupDroppable key={group.key} groupKey={group.key}>
            {card}
          </CollapsedGroupDroppable>
        ) : (
          card
        );
      })}
    </div>
  ) : null;

  return (
    <div
      ref={tableContainerRef}
      className={scrollContainerRef
        ? "min-w-0 focus:outline-none"
        : "flex-1 min-w-0 min-h-0 overflow-y-auto focus:outline-none"}
      tabIndex={0}
      onKeyDown={onTableKeyDown}
    >
      {isGrouped ? groupedTable : ((flatHeader || tickets.length > 0 || flatComposerActive) && (
        <div className={CARD_CLASS}>
          {flatHeader && (
            <div className="@container relative flex items-center gap-3 bg-[var(--color-surface-chrome)]/30 px-3 py-[9px] rounded-t-xl border-b border-border-subtle">
              <div className="min-w-0 flex-1">{flatHeader}</div>
            </div>
          )}
          {tickets.length > 0 && (enableVirtualization ? virtualizedTable : ((externalDnd || onReorder) ? dndTable : plainTable))}
          {/* Forward-planning placeholders for the open single sprint (BRDG-304): the
              parent scopes the list to this sprint, so they all render below the tickets.
              Creating one rides the regular composer (its "Placeholder" type option). */}
          {(placeholders?.length ?? 0) > 0 && (
            <table className="w-full table-fixed border-collapse text-body-lg">
              <tbody>{renderPlaceholderRows(placeholders!)}</tbody>
            </table>
          )}
          {/* Empty sprint: the injected-row path has no rows to attach to, so render the composer directly. */}
          {tickets.length === 0 && flatComposerActive && onCreateTicket && flatCreateTarget && (
            <ChildIssueComposer
              variant="bar"
              autoFocus
              onCreate={(title, jiraType) => onCreateTicket(flatCreateTarget.sprintId, title, jiraType)}
              onEscapeEmpty={onCloseFlatComposer}
              placeholder={flatCreateTarget.sprintId === null ? "Create story in the backlog..." : "Create story in this sprint..."}
              allowPlaceholder={!!onPlaceholderCreate}
              onCreatePlaceholder={onPlaceholderCreate ? (t) => onPlaceholderCreate(flatCreateTarget.sprintId, t) : undefined}
            />
          )}
        </div>
      ))}
      {tickets.length === 0 && !isGrouped && !flatComposerActive && (placeholders?.length ?? 0) === 0 && (
        <EmptyState
          icon={<Sheet className="h-6 w-6 text-text-muted" strokeWidth={1} />}
          title="No tickets in this sprint"
          description="Tickets will appear here once they are added to the sprint in Jira"
          className="py-16"
        />
      )}
      {isGrouped && groups.every((g) => g.tickets.length === 0) && (placeholders?.length ?? 0) === 0 && (
        <EmptyState
          icon={<Sheet className="h-6 w-6 text-text-muted" strokeWidth={1} />}
          title="No tickets"
          description="Tickets will appear here once they are added in Jira"
          className="py-16"
        />
      )}
    </div>
  );
}
