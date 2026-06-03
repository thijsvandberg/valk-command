"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import type { Ticket, POStatus, TicketReadiness, IssueType, JiraStatus, Sprint } from "@/types/ticket";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import type { SortField, SortDir, InlineTagId } from "@/components/sprint-board/FilterBar";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { Sheet, Inbox } from "lucide-react";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { GroupCard, GROUP_CARD_CLASS } from "@/components/sprint-board/GroupCard";
import type { TicketGroup, GroupByOption } from "@/components/sprint-board/useGroupBy";
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
  scrollContainerRef,
  refinementSessionMap,
  onRemoveFromRefinement,
  onViewRefinement,
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
  // When grouping by sprint, pin a sprint group to the tab bar. Key is the sprint id.
  pinnedSprintIds?: Set<string>;
  onPinSprint?: (sprintId: string) => void;
  // When grouping by sprint, open the goal/dates editor or close (finish) a sprint group. Key is the sprint id.
  onEditSprint?: (sprintId: string) => void;
  onCloseSprint?: (sprintId: string) => void;
  // When provided, the table uses this as its scroll container (for shared scroll with analytics).
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  refinementSessionMap?: Map<string, TicketSessionEntry[]>;
  /** Remove a ticket from a refinement session (from the gem hover card). */
  onRemoveFromRefinement?: (sessionId: string, ticketKey: string) => void;
  /** Navigate to a refinement session (from the gem hover card). */
  onViewRefinement?: (sessionId: string) => void;
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

  const enableVirtualization = tickets.length > VIRTUALIZE_THRESHOLD;
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
  }), [checkedTickets, selectedTicket, focusedTicketIdx, someChecked, activeDragId, visibleTags, hideEpic, showSprint, sprintNameMap, poStatuses, readinessMap, inflightKeys, contextMenuKeys, onSelectTicket, onRowContextMenu, handleCheckboxClick, onPoStatusChange, onReadinessChange, onBusinessValueChange, onStoryPointsChange, onJiraStatusChange, onIssueTypeChange, onTitleChange, onAssigneeChange, onEpicChange, onSprintChange, sprints, onCloseSubtasks, editingTitleKey, reviewPopoverKey, handleToggleReviewPopover, onRunReview, followedKeys, followTicket, unfollowTicket, lastDeployedMap, healthMap, refinementSessionMap, ticketInfoMap, onRemoveFromRefinement, onViewRefinement]);

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
            />
          );
        })}
        {paddingBottom > 0 && (
          <tr><td style={{ height: paddingBottom, padding: 0, border: "none" }} /></tr>
        )}
      </tbody>
    </table>
  );

  const plainTable = (
    <table className="w-full table-fixed border-collapse text-body-lg">
      <tbody>
        {tickets.map((ticket, ticketIdx) => (
          <BoardRow key={ticket.key} {...makeRowProps(ticket, ticketIdx)} />
        ))}
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
        {tickets.map((ticket, ticketIdx) => {
          let insertLine: "above" | "below" | undefined;
          if (dragOverKey && ticket.key === dragOverKey && activeInsertIdx !== -1 && overInsertIdx !== -1) {
            insertLine = activeInsertIdx > overInsertIdx ? "above" : "below";
          }
          return (
            <SortableBoardRow
              key={ticket.key}
              {...makeRowProps(ticket, ticketIdx)}
              insertLine={insertLine}
            />
          );
        })}
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
        const groupSprint = isSprintGroup ? sprints?.find((s) => s.id === group.key) : undefined;

        const activeCriterion = groupFilter?.groupKey === group.key ? groupFilter.criterion : null;
        const visibleGroupTickets = activeCriterion === "todo"
          ? group.tickets.filter((t) => t.jiraStatus === "TO DO")
          : activeCriterion === "in-progress"
            ? group.tickets.filter((t) => t.jiraStatus === "IN PROGRESS")
            : activeCriterion === "test"
              ? group.tickets.filter((t) => t.jiraStatus === "TEST")
              : activeCriterion === "done"
                ? group.tickets.filter((t) => t.jiraStatus === "DONE")
                : activeCriterion === "unpointed"
                  // Matches the GroupStatBar warning exactly: unpointed stories
                  // (only for the active sprint, where that warning shows) plus any
                  // deprecated-with-points tickets, so clicking the warning reveals
                  // precisely the items it flagged.
                  ? group.tickets.filter((t) =>
                      (groupBy === "sprint" && activeSprintIds.has(group.key)
                        && t.storyPoints == null && t.jiraStatus !== "DEPRECATED" && t.type !== "spike")
                      || (t.jiraStatus === "DEPRECATED" && t.storyPoints != null && t.storyPoints > 0))
                  : group.tickets;

        function toggleGroupFilter(criterion: "todo" | "in-progress" | "test" | "done" | "unpointed") {
          setGroupFilter((prev) =>
            prev?.groupKey === group.key && prev.criterion === criterion
              ? null
              : { groupKey: group.key, criterion },
          );
        }

        const groupTicketIds = visibleGroupTickets.map((t) => t.key);

        const ticketRows = !isCollapsed && visibleGroupTickets.map((ticket) => {
          const flatIdx = tickets.findIndex((t) => t.key === ticket.key);
          let insertLine: "above" | "below" | undefined;
          if (dragOverKey && ticket.key === dragOverKey && activeInsertIdx !== -1 && overInsertIdx !== -1) {
            insertLine = activeInsertIdx > overInsertIdx ? "above" : "below";
          }
          return externalDnd ? (
            <SortableBoardRow
              key={ticket.key}
              {...makeRowProps(ticket, flatIdx)}
              insertLine={insertLine}
            />
          ) : (
            <BoardRow
              key={ticket.key}
              {...makeRowProps(ticket, flatIdx)}
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

        return (
          <GroupCard
            key={group.key}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => onToggleCollapse?.(group.key)}
            header={
              <GroupStatBar
                tickets={group.tickets}
                label={group.label}
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
              />
            }
          >
            <table className="w-full table-fixed border-collapse text-body-lg">
              <tbody>{groupRows}</tbody>
            </table>
          </GroupCard>
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
      {isGrouped ? groupedTable : (tickets.length > 0 && (
        <div className={CARD_CLASS}>
          {enableVirtualization ? virtualizedTable : ((externalDnd || onReorder) ? dndTable : plainTable)}
        </div>
      ))}
      {tickets.length === 0 && !isGrouped && (
        <EmptyState
          icon={<Sheet className="h-6 w-6 text-text-muted" strokeWidth={1} />}
          title="No tickets in this sprint"
          description="Tickets will appear here once they are added to the sprint in Jira"
          className="py-16"
        />
      )}
      {isGrouped && groups.every((g) => g.tickets.length === 0) && (
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
