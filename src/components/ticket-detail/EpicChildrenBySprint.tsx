"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { EpicChild, Subtask, Sprint, Ticket, JiraStatus, TicketReadiness, PlaceholderTicket } from "@/types/ticket";
import { PlaceholderRow } from "@/components/sprint-board/PlaceholderRow";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { BoardRow, SortableBoardRow } from "@/components/sprint-board/BoardRow";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import { ChildIssueComposer } from "./ChildIssueComposer";
import { groupChildrenBySprint, nextRegularSprintGroup, nextRegularSprintCreateGroup, placeNextCreateZone, backlogDropGroups, sortNamedGroups, isEpicChild, epicChildToTicket, UNSCHEDULED_GROUP_KEY, type ChildGroup } from "@/lib/epic-children-grouping";
import { resolveDragEnd, insertLineForRow, type ChildReorder, type ChildMoveToPosition } from "@/lib/epic-children-reorder";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import { isBacklogSprintName } from "@/lib/sprint-utils";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { epicChildrenCollisionDetection } from "./epic-children-collision";
import { CircleDot, CalendarRange, GripVertical, Plus, Sparkles } from "lucide-react";

export type { ChildReorder, ChildMoveToPosition };

interface EpicChildrenBySprintProps {
  /** Already filtered child issues (status filter applied by the parent). */
  items: (EpicChild | Subtask)[];
  /** Sprint metadata used to derive state, date range and ordering. */
  sprints: Sprint[];
  /** Epic key, namespaces the per-session collapse state so epics do not collide. */
  ticketKey: string;
  visibleFields: Set<string>;
  /** Child currently open in the SidePanel; its row renders as active. */
  activeChildKey?: string | null;
  onJiraStatusChange: (childKey: string, status: JiraStatus) => void;
  onReadinessChange: (childKey: string, readiness: TicketReadiness | null) => void;
  // SP / BV / guess edits, forwarded straight to BoardRow's pickers (BRDG-367).
  onStoryPointsChange?: (childKey: string, value: number | null) => void;
  onBusinessValueChange?: (childKey: string, value: number | null) => void;
  onGuestimationChange?: (childKey: string, value: number | null) => void;
  onSelect?: (key: string) => void;
  /** Move a child to a sprint (id or "__backlog__"). Enables drag. */
  onMoveChild?: (childKey: string, targetSprintId: string) => void;
  /** Right-click a row to open the shared action menu. Receives the row key and the event. */
  onRowContextMenu?: (key: string, e: React.MouseEvent) => void;
  /** Reorder a child within its own sprint group via Jira rank. Enables drag-to-reorder. */
  onReorderChild?: (reorder: ChildReorder) => void;
  /** Move a child into another sprint and land it at a specific position in one drop. */
  onMoveChildToPosition?: (move: ChildMoveToPosition) => void;
  /** Surfaces a move rejection (e.g. closed sprint) to the parent's toast. */
  onMoveError?: (message: string) => void;
  /**
   * Dropping onto the BRDG-309 "create the next sprint" zone. Receives the dragged
   * child's key and the predicted sprint name; the parent opens the Create Sprint
   * modal prefilled with it and, on create, moves the child into the new sprint. When
   * omitted, the create zone is not offered.
   */
  onPlanNextSprint?: (childKey: string, suggestedSprintName?: string) => void;
  /**
   * Create a child issue into a sprint. `target.sprintId` is null for the
   * Unscheduled group (no sprint). When supplied, each non-closed group header
   * reveals a "+" that opens an inline composer.
   */
  onCreateChild?: (target: { sprintId: string | null; sprintName: string | null }, title: string, jiraType: string) => void;
  /** Multiselect: when supplied, rows render a leading checkbox. */
  checkedKeys?: Set<string>;
  someChecked?: boolean;
  onCheckboxClick?: (key: string, shiftKey: boolean) => void;
  /** Multiselect: toggle the selection of every selectable row in a sprint group at
   *  once. When supplied (with onCheckboxClick), each group header renders a tri-state
   *  "select all in this group" checkbox. */
  onSelectGroup?: (keys: string[], select: boolean) => void;
  /** Forward-planning mode (BRDG-303): shows the fullness meter on resolvable sprint groups. */
  planningOn?: boolean;
  /** sprintId -> pencil capacity, for the fullness meter. */
  pencilCapacityMap?: Record<string, number>;
  onPencilCapacityChange?: (sprintId: string, value: number | null) => void;
  /** sprintId -> total effective points across the WHOLE sprint (not just this epic's
   *  children), so the meter reflects real sprint fullness (BRDG-303). */
  sprintUsedMap?: Record<string, number>;
  /** Forward-planning placeholders for this epic (BRDG-304), bucketed into their
   *  sprint group. Shown only when planning mode is on. Non-draggable. */
  placeholders?: PlaceholderTicket[];
  onPlaceholderUpdate?: (id: string, patch: Partial<PlaceholderTicket>) => void;
  onPlaceholderDelete?: (id: string) => void;
  onPlaceholderPromote?: (id: string) => void;
  /** Create a placeholder with a title into a sprint (id) or unscheduled (null). Wired to
   *  the per-group composer's "Placeholder" type option. */
  onPlaceholderCreate?: (sprintId: string | null, title: string) => void;
  /** Persist a new top-to-bottom order for a sprint group's placeholders (BRDG-328).
   *  When provided (with onPlaceholderUpdate for cross-sprint moves), placeholders become
   *  draggable in this view. */
  onPlaceholderReorder?: (orderedIds: string[]) => void;
}


// True when the dragged row's center sits below the hovered row's center, i.e. the
// cursor is in the row's bottom half, so a drop should land after it. Lets a target
// with a single item be dropped onto from either side.
function isBelowOverRow(active: DragOverEvent["active"], over: DragOverEvent["over"]): boolean {
  const a = active.rect.current.translated;
  const o = over?.rect;
  if (!a || !o) return false;
  return a.top + a.height / 2 > o.top + o.height / 2;
}

// Matches GroupStatBar's noPointsCount: genuinely unpointed stories only, so the
// warning's click-to-filter shows exactly the items the warning counted.
function isUnpointedChild(child: EpicChild | Subtask): boolean {
  const sp = isEpicChild(child) ? child.storyPoints : null;
  return sp == null && child.jiraStatus !== "DEPRECATED" && child.type !== "spike";
}

// Matches GroupStatBar's deprecatedWithSp: deprecated tickets that still carry points.
function isDeprecatedWithSpChild(child: EpicChild | Subtask): boolean {
  const sp = isEpicChild(child) ? child.storyPoints : null;
  return child.jiraStatus === "DEPRECATED" && sp != null && sp > 0;
}

// GroupStatBar reads storyPoints / businessValue / jiraStatus / type off a Ticket.
// Epic children carry no businessValue, so the BV pill and average simply do not
// render for these groups, which is acceptable for this view.
function toStatTicket(child: EpicChild | Subtask): Ticket {
  const epic = isEpicChild(child) ? child : null;
  return {
    storyPoints: epic?.storyPoints ?? null,
    guestimation: epic?.guestimation ?? null,
    businessValue: epic?.businessValue ?? null,
    jiraStatus: child.jiraStatus,
    type: child.type,
  } as unknown as Ticket;
}

const STATE_CHIP: Record<Sprint["state"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "text-[var(--color-brand-300)] bg-[var(--color-brand-500)]/15" },
  future: { label: "Future", cls: "text-text-tertiary bg-overlay-default" },
  closed: { label: "Closed", cls: "text-text-muted bg-overlay-subtle" },
  backlog: { label: "Backlog", cls: "text-text-muted bg-overlay-subtle" },
};

function SprintStateChip({ state, className = "" }: { state: Sprint["state"]; className?: string }) {
  const chip = STATE_CHIP[state];
  if (!chip) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip.cls} ${className}`}>
      {chip.label}
    </span>
  );
}

// Draggable placeholder row (BRDG-328): mirrors the sortable child rows so placeholders can be
// reordered within their block and moved between sprint groups. data.type="placeholder"
// lets handleDragEnd route it to the placeholder reorder/move path, away from the
// Jira-rank child logic.
function SortablePlaceholderRow({
  placeholder,
  sprintName,
  state,
  reserveCheckboxGutter,
  isLastInCard,
  onUpdate,
  onDelete,
  onPromote,
}: {
  placeholder: PlaceholderTicket;
  sprintName: string | null;
  state: Sprint["state"] | null;
  reserveCheckboxGutter: boolean;
  isLastInCard: boolean;
  onUpdate: (id: string, patch: Partial<PlaceholderTicket>) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: placeholder.id,
    data: { type: "placeholder", sprintName, state },
  });
  return (
    <PlaceholderRow
      placeholder={placeholder}
      reserveCheckboxGutter={reserveCheckboxGutter}
      isLastInCard={isLastInCard}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onPromote={onPromote}
      className={isDragging ? "opacity-40" : ""}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dndProps={{ ...attributes }}
      dragHandleSlot={
        <span
          ref={setActivatorNodeRef}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 cursor-grab items-center text-text-muted hover:!opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:cursor-grabbing"
          aria-label={`Drag placeholder ${placeholder.title} to reorder or move it to another sprint`}
        >
          <GripVertical size={12} strokeWidth={1.5} />
        </span>
      }
    />
  );
}

// Wraps a group's GroupCard as a drop target. Highlights with a brand ring while a
// row hovers over it, and dims the closed groups that reject the drop.
function DroppableGroup({
  group,
  isDragging,
  children,
  ...cardProps
}: {
  group: ChildGroup;
  isDragging: boolean;
  children: ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  header: ReactNode;
  headerExtras?: ReactNode;
  floatingAction?: ReactNode;
  floatingActionVisible?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: group.key,
    data: { type: "group", sprintName: group.sprintName, state: group.state, isCreateZone: group.isCreateZone, isDropZone: group.isDropZone },
  });
  const isClosed = group.state === "closed";
  const isCreate = !!group.isCreateZone;
  const highlight = isOver && !isClosed;
  // The create zone (BRDG-309) reads as a "new sprint" action, not a plain move:
  // a persistent dashed brand outline (vs BRDG-306's solid ring) that brightens on
  // hover. Outline sits outside the card's own border with no layout shift.
  const createOutline = isCreate
    ? highlight
      ? "outline-2 outline-dashed outline-offset-2 outline-[var(--color-brand-400)]"
      : "outline-2 outline-dashed outline-offset-2 outline-[var(--color-brand-400)]/45"
    : "";
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl ${
        isCreate ? createOutline : highlight ? "ring-2 ring-[var(--color-brand-400)]/70" : "ring-0"
      } ${isDragging && isClosed ? "opacity-50" : ""}`}
      style={{ transition: "box-shadow 0.12s ease, outline-color 0.12s ease, opacity 0.12s ease" }}
    >
      <GroupCard {...cardProps}>{children}</GroupCard>
    </div>
  );
}

export function EpicChildrenBySprint({
  items,
  sprints,
  ticketKey,
  visibleFields,
  activeChildKey,
  onJiraStatusChange,
  onReadinessChange,
  onStoryPointsChange,
  onBusinessValueChange,
  onGuestimationChange,
  onSelect,
  onMoveChild,
  onRowContextMenu,
  onReorderChild,
  onMoveChildToPosition,
  onMoveError,
  onPlanNextSprint,
  onCreateChild,
  checkedKeys,
  someChecked,
  onCheckboxClick,
  onSelectGroup,
  planningOn = false,
  pencilCapacityMap,
  onPencilCapacityChange,
  sprintUsedMap,
  placeholders,
  onPlaceholderUpdate,
  onPlaceholderDelete,
  onPlaceholderPromote,
  onPlaceholderCreate,
  onPlaceholderReorder,
}: EpicChildrenBySprintProps) {
  const [collapsed, setCollapsed] = useSessionStorage<Record<string, boolean>>(
    `epic-children-collapse-${ticketKey}`,
    {},
  );

  const [activeDragKey, setActiveDragKey] = useState<string | null>(null);
  // Key of the row currently hovered during a drag, used to render the drop-indicator bar.
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // Whether the hovered row's drop lands after it (cursor in its bottom half).
  const [dragInsertAfter, setDragInsertAfter] = useState(false);
  // Which group has its inline create composer open (only one at a time).
  const [composerGroupKey, setComposerGroupKey] = useState<string | null>(null);

  // Opening a composer expands its group so the input is visible; clicking the
  // same group's "+" again closes it.
  const openComposer = useCallback(
    (key: string) => {
      setComposerGroupKey((cur) => (cur === key ? null : key));
      setCollapsed((prev) => (prev[key] ? { ...prev, [key]: false } : prev));
    },
    [setCollapsed],
  );
  const draggingRef = useRef(false);
  // The unpointed-warning filter is scoped to the group whose warning was clicked.
  const [unpointedFilterKey, setUnpointedFilterKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const toggle = useCallback(
    (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] })),
    [setCollapsed],
  );

  const groups = groupChildrenBySprint(items, sprints);

  const dndEnabled = !!onMoveChild || !!onReorderChild;

  // While dragging, surface the next regular sprint as an extra empty drop target
  // (BRDG-306) so a child can be pushed one sprint forward into a sprint the epic
  // isn't in yet, without the right-click menu. Only when moves are enabled; the
  // synthetic group sorts into the regular series via the shared comparator.
  const dragGroups = useMemo(() => {
    if (!dndEnabled || activeDragKey === null) return groups;
    // Drag-only drop zones surfaced so any target is reachable mid-drag. The next-sprint
    // slot is a single zone, mutually exclusive: BRDG-306's plain move zone when that
    // sprint exists, else BRDG-309's create zone. Backlog zones cover the epic's backlogs.
    const named = groups.filter((g) => g.key !== UNSCHEDULED_GROUP_KEY);
    const extras: ChildGroup[] = [];
    const moveZone = nextRegularSprintGroup(groups, sprints);
    if (moveZone) extras.push(moveZone);
    extras.push(...backlogDropGroups(groups, sprints));
    // Sort the real + move + backlog groups (all known/dated) together first.
    let ordered = sortNamedGroups([...named, ...extras], sprints);
    // Then slot the create zone right after the team's last numbered sprint, in order.
    const createZone = onPlanNextSprint ? nextRegularSprintCreateGroup(groups, sprints) : null;
    if (createZone) ordered = placeNextCreateZone(ordered, createZone);

    // Always expose the no-sprint backlog (the "Unscheduled" bucket) as a drop target
    // during a drag, even when the epic currently has no unscheduled children, so a
    // child can be sent back to the backlog. When it already has children it stays a
    // normal group; otherwise a synthetic empty drop zone stands in for it.
    const realUnscheduled = groups.filter((g) => g.key === UNSCHEDULED_GROUP_KEY);
    const unscheduledZone: ChildGroup[] = realUnscheduled.length > 0
      ? realUnscheduled
      : [{ key: UNSCHEDULED_GROUP_KEY, label: "Unscheduled", sprintName: null, items: [], isActive: false, state: null, dateRange: null, isDropZone: true }];
    return [...ordered, ...unscheduledZone];
  }, [groups, sprints, activeDragKey, dndEnabled, onPlanNextSprint]);

  // Keys that exist in the real grouping; anything in dragGroups outside this set
  // is the synthetic next-sprint drop zone (drag-only, no create affordance).
  const realGroupKeys = useMemo(() => new Set(groups.map((g) => g.key)), [groups]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    draggingRef.current = true;
    setActiveDragKey(String(e.active.id));
    setDragOverKey(null);
    setDragInsertAfter(false);
  }, []);

  // Track only row hovers (not group cards) so the drop bar shows on a target row.
  const handleDragOver = useCallback((e: DragOverEvent) => {
    const { active, over } = e;
    const overData = over?.data.current as { type?: "child" | "group" } | undefined;
    const onRow = !!over && overData?.type === "child";
    setDragOverKey(onRow ? String(over!.id) : null);
    setDragInsertAfter(onRow ? isBelowOverRow(active, over) : false);
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      draggingRef.current = false;
      setActiveDragKey(null);
      setDragOverKey(null);
      setDragInsertAfter(false);
      const { active, over } = e;
      if (!over) return;

      const activeKey = String(active.id);
      const childSprintName = (active.data.current?.sprintName ?? null) as string | null;
      const overData = over.data.current as
        | { type?: "child" | "group" | "placeholder"; sprintName?: string | null; state?: Sprint["state"] | null; isCreateZone?: boolean }
        | undefined;

      // Placeholders (BRDG-328) are a separate ordered block: reorder within their sprint
      // group, or move to another group (patch sprintId; the service appends to its order).
      // They never hit the Jira-rank child path or the create-sprint zone.
      if (active.data.current?.type === "placeholder") {
        if (overData?.isCreateZone) return;
        const activePh = (placeholders ?? []).find((p) => p.id === activeKey);
        if (!activePh) return;
        const overSprintName = overData?.sprintName ?? null;
        const targetSprintId = overSprintName
          ? (sprints.find((s) => s.name === overSprintName)?.id ?? null)
          : null;
        const sameGroup = (activePh.sprintId ?? null) === (targetSprintId ?? null);
        if (sameGroup) {
          const groupIds = (placeholders ?? [])
            .filter((p) => (p.sprintId ?? null) === (activePh.sprintId ?? null))
            .map((p) => p.id);
          const from = groupIds.indexOf(activeKey);
          let to = groupIds.indexOf(String(over.id));
          if (to === -1) to = groupIds.length - 1;
          if (from !== -1 && from !== to) onPlaceholderReorder?.(arrayMove(groupIds, from, to));
        } else {
          onPlaceholderUpdate?.(activeKey, { sprintId: targetSprintId });
        }
        return;
      }

      // BRDG-309: dropping onto the create zone does not move silently; it hands the
      // child key (and the predicted sprint name) to the parent, which opens the Create
      // Sprint modal prefilled with that name, then moves the child on create.
      if (overData?.isCreateZone) {
        onPlanNextSprint?.(activeKey, overData.sprintName ?? undefined);
        return;
      }

      const res = resolveDragEnd({
        activeKey,
        overId: String(over.id),
        childSprintName,
        overType: overData?.type === "placeholder" ? undefined : overData?.type,
        overSprintName: overData?.sprintName ?? null,
        overState: overData?.state ?? null,
        insertAfter: overData?.type === "child" ? isBelowOverRow(active, over) : false,
        groups: dragGroups,
        sprints,
      });

      if (res.kind === "reorder") onReorderChild?.(res.reorder);
      else if (res.kind === "move-to-position") onMoveChildToPosition?.(res.move);
      else if (res.kind === "move") onMoveChild?.(activeKey, res.targetSprintId);
      else if (res.kind === "move-rejected") onMoveError?.("Cannot move into a closed sprint.");
    },
    [dragGroups, onMoveChild, onReorderChild, onMoveChildToPosition, onMoveError, onPlanNextSprint, sprints, placeholders, onPlaceholderReorder, onPlaceholderUpdate],
  );

  const handleDragCancel = useCallback(() => {
    draggingRef.current = false;
    setActiveDragKey(null);
    setDragOverKey(null);
    setDragInsertAfter(false);
  }, []);

  if (groups.length === 0) return null;

  const selectable = !!onCheckboxClick;

  // Which inline signals BoardRow renders per child row (BRDG-367). Mirrors the flat
  // list: readiness dot + edit-state dot + flag always on; SP / BV / assignee follow
  // the field-visibility toggles. The per-row sprint chip is suppressed via
  // showSprint=false below, since the group header already names the sprint.
  const epicRowTags = new Set<InlineTagId>(["poReadiness", "editState", "flag"]);
  if (visibleFields.has("storyPoints")) epicRowTags.add("storyPoints");
  if (visibleFields.has("businessValue")) epicRowTags.add("businessValue");
  if (visibleFields.has("assignee")) epicRowTags.add("assignee");

  // BoardRow reads the readiness dot from readinessMap[key] (not ticket.readiness).
  const readinessByKey: Record<string, TicketReadiness | null> = {};
  items.forEach((c) => { readinessByKey[c.key] = isEpicChild(c) ? c.readiness : null; });

  const renderRow = (child: EpicChild | Subtask, group: ChildGroup, idx: number, roundBottom: boolean) => {
    const epic = isEpicChild(child) ? child : null;
    const isPending = child.key.startsWith("pending-");
    const isChecked = !!checkedKeys?.has(child.key);
    const isActive = child.key === activeChildKey;

    // BoardRow preventDefaults the context menu and guards isDragActive itself; the
    // draggingRef guard covers the synchronous drag-start before activeDragKey settles.
    const contextMenu =
      onRowContextMenu && !isPending
        ? (key: string, e: React.MouseEvent) => {
            if (draggingRef.current) return;
            onRowContextMenu(key, e);
          }
        : undefined;

    // Shared props for both the draggable (SortableBoardRow) and static-pending (BoardRow)
    // variants. epicChildToTicket projects the child; the group header names the sprint, so
    // the per-row sprint chip is suppressed (showSprint=false).
    const rowProps = {
      ticket: epicChildToTicket(child),
      ticketIdx: idx,
      isChecked,
      isSelected: isActive,
      isInflight: isPending,
      someChecked: !!someChecked,
      hideEpic: true,
      tags: epicRowTags,
      showKey: visibleFields.has("issueKey"),
      showStatus: visibleFields.has("status"),
      showSprint: false,
      subtaskCounts:
        visibleFields.has("subtaskCount") && epic
          ? { open: epic.openSubtaskCount ?? 0, total: epic.totalSubtaskCount ?? epic.subtaskCount }
          : undefined,
      readinessMap: readinessByKey,
      hideCheckbox: !selectable,
      selectedTicket: activeChildKey ?? null,
      onSelectTicket: (key: string | null) => { if (key) onSelect?.(key); },
      onCheckboxClick: (key: string, _idx: number, shiftKey: boolean) => onCheckboxClick?.(key, shiftKey),
      onRowContextMenu: contextMenu,
      onJiraStatusChange,
      onReadinessChange,
      onStoryPointsChange,
      onBusinessValueChange,
      onGuestimationChange,
      planningOn,
      isLastInCard: roundBottom,
    };

    if (dndEnabled && !isPending) {
      return (
        <SortableBoardRow
          key={child.key}
          {...rowProps}
          isDragActive={activeDragKey !== null}
          sortableData={{ type: "child", sprintName: group.sprintName, state: group.state }}
          insertLine={insertLineForRow({ rowKey: child.key, activeKey: activeDragKey, overKey: dragOverKey, insertAfter: dragInsertAfter, groups: dragGroups })}
        />
      );
    }

    return <BoardRow key={child.key} {...rowProps} isDragActive={false} />;
  };

  const groupCards = dragGroups.map((group) => {
    // The drag-only next-sprint drop zone: empty, no create affordance, just a hint.
    const isSynthetic = !realGroupKeys.has(group.key);
    // BRDG-309's variant: dropping here opens the Create Sprint modal rather than moving.
    const isCreateZone = !!group.isCreateZone;
    const isCollapsed = !!collapsed[group.key];
    const isUnscheduled = group.sprintName === null;
    const filterActive = unpointedFilterKey === group.key;
    // Match the warning: unpointed stories only when this is the active sprint,
    // plus any deprecated-with-points tickets.
    const visibleItems = filterActive
      ? group.items.filter((c) => (group.isActive && isUnpointedChild(c)) || isDeprecatedWithSpChild(c))
      : group.items;
    // No fixed-width label column here (labelWidthClass=""): groups in this view
    // differ in header width because some sprints carry a date range and the
    // backlog does not. That made the gated `@2xl:w-48` trip inconsistently and
    // leave dead space before the item count on the wider groups. Collapsing to
    // the label's own width keeps every group's count tight to its label.
    // Resolve a real sprint id for planning: only named (non-synthetic) groups whose
    // sprint resolves to an id get the fullness meter; the create/unscheduled/backlog
    // zones do not (BRDG-303). Backlog sprints ("GXP: Backlog") arrive from Jira as
    // regular future sprints, so they're excluded by name: a backlog has no planning
    // capacity to track fullness against.
    const planningSprintId = !isSynthetic && !isUnscheduled && group.sprintName && !isBacklogSprintName(group.sprintName)
      ? sprints.find((s) => s.name === group.sprintName)?.id
      : undefined;
    // Select-all-in-group: only real groups with selectable (non-pending) rows expose
    // the header checkbox. State is derived from the parent's checkedKeys so it stays
    // in sync with per-row toggles and the bulk bar.
    const groupSelectableKeys = !isSynthetic
      ? group.items.filter((c) => !c.key.startsWith("pending-")).map((c) => c.key)
      : [];
    const groupAllChecked = groupSelectableKeys.length > 0 && groupSelectableKeys.every((k) => checkedKeys?.has(k));
    const groupSomeChecked = !groupAllChecked && groupSelectableKeys.some((k) => checkedKeys?.has(k));
    const header = (
      <GroupStatBar
        tickets={group.items.map(toStatTicket)}
        label={group.label}
        sprint={group.sprintName ? sprints.find((s) => s.name === group.sprintName) : undefined}
        isActive={group.isActive}
        {...(selectable && onSelectGroup && groupSelectableKeys.length > 0
          ? {
              onSelectAll: () => onSelectGroup(groupSelectableKeys, !groupAllChecked),
              selectAllChecked: groupAllChecked,
              selectAllIndeterminate: groupSomeChecked,
              selectionActive: someChecked,
            }
          : {})}
        {...(planningOn && planningSprintId && onPencilCapacityChange
          ? {
              planningOn: true,
              pencilCapacity: pencilCapacityMap?.[planningSprintId] ?? null,
              onPencilCapacityChange: (v: number | null) => onPencilCapacityChange(planningSprintId, v),
              // The meter must reflect the whole sprint, not just this epic's children.
              usedPointsOverride: sprintUsedMap?.[planningSprintId] ?? 0,
            }
          : {})}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => toggle(group.key)}
        showStatusCounts={false}
        showBvAvg={false}
        labelWidthClass=""
        activeCriterion={filterActive ? "unpointed" : null}
        onFilterChange={(c) => {
          setUnpointedFilterKey(c ? group.key : null);
          // Expand the group so the filtered rows are actually visible.
          if (c) setCollapsed((prev) => ({ ...prev, [group.key]: false }));
        }}
        leadingIcon={
          isCreateZone
            ? <Sparkles size={12} className="text-[var(--color-brand-400)]" />
            : isUnscheduled
              ? <CircleDot size={12} />
              // Real sprint groups carry no leading icon, matching the sprint board's
              // grouped-by-sprint view. The lightning glyph means "Epic" everywhere else, so
              // using it for a sprint here read as the wrong icon.
              : undefined
        }
      />
    );
    // Resolve the group's sprint id for creation (grouping keys by name only).
    // Null for Unscheduled; undefined when a named group's sprint is unknown.
    const createSprintId = isUnscheduled
      ? null
      : sprints.find((s) => s.name === group.sprintName)?.id;
    // No "+" on closed sprints (Jira rejects creating into them) or on named
    // groups whose sprint cannot be resolved to an id.
    const canCreate =
      !isSynthetic &&
      !!onCreateChild &&
      group.state !== "closed" &&
      !(group.sprintName !== null && createSprintId === undefined);
    const isComposerOpen = composerGroupKey === group.key;
    // The composer renders only when both open and a create handler is wired; it then
    // becomes the card's bottom-most element.
    const composerRendered = isComposerOpen && !!onCreateChild;

    const headerExtras = isCreateZone ? (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-300)] bg-[var(--color-brand-500)]/15">
        New sprint
      </span>
    ) : group.state || group.dateRange ? (
        <>
          {/* Below a cramped card width the state chip is dropped first so the
              item count + scores stay readable (the @container is GroupCard's header row). */}
          {group.state && <SprintStateChip state={group.state} className="hidden @xl:inline-block" />}
          {group.dateRange && (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <CalendarRange size={11} strokeWidth={1.5} /> {group.dateRange}
            </span>
          )}
        </>
      ) : undefined;
    // The "+" floats over the header's right edge (date range / scores) so it
    // reserves no space; it surfaces on hover or while its composer is open.
    const floatingAction = canCreate ? (
      <button
        type="button"
        aria-label={`Create issue in ${group.label}`}
        onClick={(e) => {
          e.stopPropagation();
          openComposer(group.key);
        }}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-text-muted [transition:color_.12s_ease,background-color_.12s_ease] hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <Plus size={14} strokeWidth={1.75} />
      </button>
    ) : undefined;
    // Sortable ids are the non-pending rows actually rendered in this group, so
    // dnd targets line up with the SortableContext's item list.
    const sortableIds = dndEnabled
      ? visibleItems.filter((c) => !c.key.startsWith("pending-")).map((c) => c.key)
      : [];

    // Forward-planning placeholders (BRDG-304) bucket into this sprint group by the
    // resolved sprint id (null = Unscheduled). They never enter the dnd/grouping
    // machinery: they render after the sortable rows as their own dashed rows, and a
    // dashed "Add placeholder" affordance creates one into this group's sprint.
    const groupPlaceholders =
      planningOn && !isSynthetic && createSprintId !== undefined
        ? (placeholders ?? []).filter((p) => (p.sprintId ?? null) === (createSprintId ?? null))
        : [];
    // Placeholders are draggable (reorder + cross-sprint move) when a reorder handler is
    // wired and dnd is active; otherwise they render as static rows (e.g. Sprint Board).
    const placeholdersDraggable = dndEnabled && !!onPlaceholderReorder;
    const placeholderIds = groupPlaceholders.map((p) => p.id);

    // Round whichever element is genuinely the card's bottom so its background cannot
    // bleed past the rounded corner: the composer if open, else the last placeholder,
    // else the last data row.
    const lastDataRowIsBottom = groupPlaceholders.length === 0 && !composerRendered;
    const lastPlaceholderIsBottom = !composerRendered;
    const rows = visibleItems.map((child, idx) =>
      renderRow(child, group, idx, lastDataRowIsBottom && idx === visibleItems.length - 1),
    );

    const placeholderBlock =
      groupPlaceholders.length > 0 ? (
        <div className="flex flex-col">
          {placeholdersDraggable ? (
            <SortableContext items={placeholderIds} strategy={verticalListSortingStrategy}>
              {groupPlaceholders.map((p, idx) => (
                <SortablePlaceholderRow
                  key={p.id}
                  placeholder={p}
                  sprintName={group.sprintName}
                  state={group.state}
                  reserveCheckboxGutter={selectable}
                  isLastInCard={lastPlaceholderIsBottom && idx === groupPlaceholders.length - 1}
                  onUpdate={onPlaceholderUpdate ?? (() => {})}
                  onDelete={onPlaceholderDelete ?? (() => {})}
                  onPromote={onPlaceholderPromote ?? (() => {})}
                />
              ))}
            </SortableContext>
          ) : (
            groupPlaceholders.map((p, idx) => (
              <PlaceholderRow
                key={p.id}
                placeholder={p}
                reserveCheckboxGutter={selectable}
                isLastInCard={lastPlaceholderIsBottom && idx === groupPlaceholders.length - 1}
                onUpdate={onPlaceholderUpdate ?? (() => {})}
                onDelete={onPlaceholderDelete ?? (() => {})}
                onPromote={onPlaceholderPromote ?? (() => {})}
              />
            ))
          )}
        </div>
      ) : null;

    const body = isCreateZone ? (
      <div className="flex items-center gap-2 px-4 py-3 text-body-sm text-[var(--color-brand-300)]">
        <Plus size={13} strokeWidth={2} className="shrink-0" />
        <span>
          Create new sprint <span className="font-semibold">{group.label}</span>
          <span className="text-text-muted">… and move here</span>
        </span>
      </div>
    ) : isSynthetic ? (
      <div className="px-4 py-3 text-body-sm italic text-text-muted">
        Drop here to move to {group.label}
      </div>
    ) : (
      <>
        {/* BoardRow renders a <tr>, so the data rows live in a small per-card table
            (the inbox reuse pattern). Placeholders + composer stay as sibling blocks
            below it, aligned to the same gutters (BRDG-367). */}
        <table className="w-full table-fixed border-collapse text-body-lg">
          <tbody>
            {dndEnabled ? (
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {rows}
              </SortableContext>
            ) : (
              rows
            )}
          </tbody>
        </table>
        {placeholderBlock}
        {isComposerOpen && onCreateChild && (
          <ChildIssueComposer
            variant="bar"
            autoFocus
            // The composer is the card's last child; round its bottom so the footer
            // strip's tint cannot bleed past the card's rounded corner (the card's
            // overflow-clip-margin, kept for the row drag handle, lets content into
            // the corner squares otherwise). 11px nests inside the card's 1px border.
            className="rounded-b-[11px]"
            onCreate={(title, jiraType) =>
              onCreateChild({ sprintId: createSprintId ?? null, sprintName: group.sprintName }, title, jiraType)
            }
            onEscapeEmpty={() => setComposerGroupKey(null)}
            placeholder={isUnscheduled ? "Create unscheduled issue..." : `Create issue in ${group.label}...`}
            allowPlaceholder={!!onPlaceholderCreate}
            onCreatePlaceholder={onPlaceholderCreate ? (t) => onPlaceholderCreate(createSprintId ?? null, t) : undefined}
          />
        )}
      </>
    );

    if (!dndEnabled) {
      return (
        <GroupCard
          key={group.key}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => toggle(group.key)}
          header={header}
          headerExtras={headerExtras}
          floatingAction={floatingAction}
          floatingActionVisible={isComposerOpen}
        >
          {body}
        </GroupCard>
      );
    }

    return (
      <DroppableGroup
        key={group.key}
        group={group}
        isDragging={activeDragKey !== null}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => toggle(group.key)}
        header={header}
        headerExtras={headerExtras}
        floatingAction={floatingAction}
        floatingActionVisible={isComposerOpen}
      >
        {body}
      </DroppableGroup>
    );
  });

  const activeChild = activeDragKey ? items.find((i) => i.key === activeDragKey) ?? null : null;

  const list = <div className="flex flex-col gap-3">{groupCards}</div>;

  return (
    <>
      {dndEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={epicChildrenCollisionDetection}
          // Re-measure droppables continuously so the next-sprint drop zone, which
          // only mounts once a drag begins (BRDG-306), is detected as a target.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {list}
          <DragOverlay dropAnimation={null}>
            {activeChild ? (
              <div className="flex items-center gap-2 rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-body-lg text-text-primary shadow-[var(--shadow-lg)]">
                <GripVertical size={12} strokeWidth={1.5} className="text-text-muted" />
                <span className="truncate">{activeChild.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        list
      )}
    </>
  );
}
