"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { EpicChild, Subtask, Sprint, Ticket, JiraStatus, TicketReadiness } from "@/types/ticket";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { ChildIssueRow } from "./ChildIssueRow";
import { ChildIssueComposer } from "./ChildIssueComposer";
import { groupChildrenBySprint, nextRegularSprintGroup, nextRegularSprintCreateGroup, placeNextCreateZone, backlogDropGroups, sortNamedGroups, UNSCHEDULED_GROUP_KEY, type ChildGroup } from "@/lib/epic-children-grouping";
import { resolveDragEnd, insertLineForRow, type ChildReorder, type ChildMoveToPosition } from "@/lib/epic-children-reorder";
import { useSessionStorage } from "@/hooks/useSessionStorage";
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
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { epicChildrenCollisionDetection } from "./epic-children-collision";
import { Zap, CircleDot, CalendarRange, GripVertical, Plus, Sparkles } from "lucide-react";

export type { ChildReorder, ChildMoveToPosition };

interface EpicChildrenBySprintProps {
  /** Already filtered child issues (status filter applied by the parent). */
  items: (EpicChild | Subtask)[];
  /** Sprint metadata used to derive state, date range and ordering. */
  sprints: Sprint[];
  /** Epic key, namespaces the per-session collapse state so epics do not collide. */
  ticketKey: string;
  visibleFields: Set<string>;
  /** The sprint group already labels the sprint, so the per-row pill is suppressed. */
  renderMetadata: (child: EpicChild | Subtask, hideSprint?: boolean) => ReactNode;
  onJiraStatusChange: (childKey: string, status: JiraStatus) => void;
  onReadinessChange: (childKey: string, readiness: TicketReadiness | null) => void;
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
  onCheckboxClick?: (key: string, e: React.MouseEvent) => void;
}

function isEpicChild(child: EpicChild | Subtask): child is EpicChild {
  return "storyPoints" in child;
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

// A row that can be picked up to reorder within its sprint group or dropped onto
// another sprint group. useSortable makes the row both draggable and a drop target,
// so a sibling row resolves the reorder anchor while a group card resolves a move.
// Drag bits go on the grip (PointerSensor's 8px threshold keeps a plain click for
// selection); the grip is also the keyboard activator via dnd-kit attributes.
function SortableChildRow({
  child,
  isLast,
  sprintName,
  state,
  insertLine,
  visibleFields,
  renderMetadata,
  onJiraStatusChange,
  onReadinessChange,
  onSelect,
  onContextMenu,
  selectable,
  isChecked,
  someChecked,
  onCheckboxClick,
}: {
  child: EpicChild | Subtask;
  isLast: boolean;
  sprintName: string | null;
  state: Sprint["state"] | null;
  insertLine?: "above" | "below";
  visibleFields: Set<string>;
  renderMetadata: (child: EpicChild | Subtask, hideSprint?: boolean) => ReactNode;
  onJiraStatusChange: (childKey: string, status: JiraStatus) => void;
  onReadinessChange: (childKey: string, readiness: TicketReadiness | null) => void;
  onSelect?: (key: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  selectable?: boolean;
  isChecked?: boolean;
  someChecked?: boolean;
  onCheckboxClick?: (e: React.MouseEvent) => void;
}) {
  const epic = isEpicChild(child) ? child : null;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: child.key,
    data: { type: "child", sprintName, state },
  });

  // The drop-indicator bar is a 2px inset brand line on the hovered row, matching
  // the sprint board's reorder cue (above when inserting before, below when after).
  const insertLineShadow =
    insertLine === "above"
      ? "inset 0 2px 0 var(--color-brand-500)"
      : insertLine === "below"
        ? "inset 0 -2px 0 var(--color-brand-500)"
        : undefined;

  return (
    <ChildIssueRow
      ref={setNodeRef}
      item={child}
      isLast={isLast}
      showTypeIcon
      showKey={visibleFields.has("issueKey")}
      showStatus={visibleFields.has("status")}
      readiness={epic?.readiness}
      onJiraStatusChange={(s) => onJiraStatusChange(child.key, s)}
      onReadinessChange={(r) => onReadinessChange(child.key, r)}
      onSelect={onSelect}
      onContextMenu={onContextMenu}
      selectable={selectable}
      isChecked={isChecked}
      someChecked={someChecked}
      onCheckboxClick={onCheckboxClick}
      metadataSlot={renderMetadata(child, true)}
      className={isDragging ? "opacity-40" : ""}
      style={{ transform: CSS.Translate.toString(transform), transition, ...(insertLineShadow ? { boxShadow: insertLineShadow } : {}) }}
      dndProps={{ ...attributes }}
      dragHandleSlot={
        <span
          ref={setActivatorNodeRef}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 cursor-grab items-center text-text-muted hover:!opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:cursor-grabbing"
          aria-label={`Drag ${child.key} to reorder or move it to another sprint`}
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
  renderMetadata,
  onJiraStatusChange,
  onReadinessChange,
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
        | { type?: "child" | "group"; sprintName?: string | null; state?: Sprint["state"] | null; isCreateZone?: boolean }
        | undefined;

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
        overType: overData?.type,
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
    [dragGroups, onMoveChild, onReorderChild, onMoveChildToPosition, onMoveError, onPlanNextSprint, sprints],
  );

  const handleDragCancel = useCallback(() => {
    draggingRef.current = false;
    setActiveDragKey(null);
    setDragOverKey(null);
    setDragInsertAfter(false);
  }, []);

  if (groups.length === 0) return null;

  const selectable = !!onCheckboxClick;

  const renderRow = (child: EpicChild | Subtask, group: ChildGroup, idx: number, total: number) => {
    const epic = isEpicChild(child) ? child : null;
    const isPending = child.key.startsWith("pending-");
    const isLast = idx === total - 1;
    const isChecked = !!checkedKeys?.has(child.key);
    const checkboxClick = onCheckboxClick ? (e: React.MouseEvent) => onCheckboxClick(child.key, e) : undefined;

    const contextMenu =
      onRowContextMenu && !isPending
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            if (draggingRef.current) return;
            onRowContextMenu(child.key, e);
          }
        : undefined;

    if (dndEnabled && !isPending) {
      return (
        <SortableChildRow
          key={child.key}
          child={child}
          isLast={isLast}
          sprintName={group.sprintName}
          state={group.state}
          insertLine={insertLineForRow({ rowKey: child.key, activeKey: activeDragKey, overKey: dragOverKey, insertAfter: dragInsertAfter, groups: dragGroups })}
          visibleFields={visibleFields}
          renderMetadata={renderMetadata}
          onJiraStatusChange={onJiraStatusChange}
          onReadinessChange={onReadinessChange}
          onSelect={onSelect}
          onContextMenu={contextMenu}
          selectable={selectable}
          isChecked={isChecked}
          someChecked={someChecked}
          onCheckboxClick={checkboxClick}
        />
      );
    }

    return (
      <ChildIssueRow
        key={child.key}
        item={child}
        isLast={isLast}
        isPending={isPending}
        showTypeIcon
        showKey={visibleFields.has("issueKey")}
        showStatus={visibleFields.has("status")}
        readiness={epic?.readiness}
        onJiraStatusChange={(s) => onJiraStatusChange(child.key, s)}
        onReadinessChange={(r) => onReadinessChange(child.key, r)}
        onSelect={onSelect}
        onContextMenu={contextMenu}
        selectable={selectable}
        isChecked={isChecked}
        someChecked={someChecked}
        onCheckboxClick={checkboxClick}
        metadataSlot={renderMetadata(child, true)}
      />
    );
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
    const header = (
      <GroupStatBar
        tickets={group.items.map(toStatTicket)}
        label={group.label}
        sprint={group.sprintName ? sprints.find((s) => s.name === group.sprintName) : undefined}
        isActive={group.isActive}
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
              : <Zap size={12} style={{ color: "var(--color-icon-sprint)" }} />
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
    const rows = visibleItems.map((child, idx) => renderRow(child, group, idx, visibleItems.length));
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
        {dndEnabled ? (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        ) : (
          rows
        )}
        {isComposerOpen && onCreateChild && (
          <ChildIssueComposer
            autoFocus
            onCreate={(title, jiraType) =>
              onCreateChild({ sprintId: createSprintId ?? null, sprintName: group.sprintName }, title, jiraType)
            }
            onEscapeEmpty={() => setComposerGroupKey(null)}
            placeholder={isUnscheduled ? "Create unscheduled issue..." : `Create issue in ${group.label}...`}
            alignKey={visibleFields.has("issueKey")}
            className={visibleItems.length > 0 ? "border-t border-border-subtle" : ""}
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
