"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import type { EpicChild, Subtask, Sprint, Ticket, JiraStatus, TicketReadiness } from "@/types/ticket";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { CursorMenu, TicketActionMenuContent } from "@/components/sprint-board/ticket-action-menu";
import { ChildIssueRow } from "./ChildIssueRow";
import { ChildIssueComposer } from "./ChildIssueComposer";
import { groupChildrenBySprint, type ChildGroup } from "@/lib/epic-children-grouping";
import { resolveDragEnd, insertLineForRow, type ChildReorder, type ChildMoveToPosition } from "@/lib/epic-children-reorder";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Zap, CircleDot, CalendarRange, GripVertical, Plus } from "lucide-react";

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
  /** Move a child to a sprint (id or "__backlog__"). Enables drag + context menu. */
  onMoveChild?: (childKey: string, targetSprintId: string) => void;
  /** Reorder a child within its own sprint group via Jira rank. Enables drag-to-reorder. */
  onReorderChild?: (reorder: ChildReorder) => void;
  /** Move a child into another sprint and land it at a specific position in one drop. */
  onMoveChildToPosition?: (move: ChildMoveToPosition) => void;
  /** Surfaces a move rejection (e.g. closed sprint) to the parent's toast. */
  onMoveError?: (message: string) => void;
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

function SprintStateChip({ state }: { state: Sprint["state"] }) {
  const chip = STATE_CHIP[state];
  if (!chip) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip.cls}`}>
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
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: group.key,
    data: { type: "group", sprintName: group.sprintName, state: group.state },
  });
  const isClosed = group.state === "closed";
  const highlight = isOver && !isClosed;
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl ${highlight ? "ring-2 ring-[var(--color-brand-400)]/70" : "ring-0"} ${
        isDragging && isClosed ? "opacity-50" : ""
      }`}
      style={{ transition: "box-shadow 0.12s ease, opacity 0.12s ease" }}
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
  onReorderChild,
  onMoveChildToPosition,
  onMoveError,
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
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; childKey: string } | null>(null);
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
        | { type?: "child" | "group"; sprintName?: string | null; state?: Sprint["state"] | null }
        | undefined;

      const res = resolveDragEnd({
        activeKey,
        overId: String(over.id),
        childSprintName,
        overType: overData?.type,
        overSprintName: overData?.sprintName ?? null,
        overState: overData?.state ?? null,
        insertAfter: overData?.type === "child" ? isBelowOverRow(active, over) : false,
        groups,
        sprints,
      });

      if (res.kind === "reorder") onReorderChild?.(res.reorder);
      else if (res.kind === "move-to-position") onMoveChildToPosition?.(res.move);
      else if (res.kind === "move") onMoveChild?.(activeKey, res.targetSprintId);
      else if (res.kind === "move-rejected") onMoveError?.("Cannot move into a closed sprint.");
    },
    [groups, onMoveChild, onReorderChild, onMoveChildToPosition, onMoveError, sprints],
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
      onMoveChild && !isPending
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            if (draggingRef.current) return;
            setRowMenu({ x: e.clientX, y: e.clientY, childKey: child.key });
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
          insertLine={insertLineForRow({ rowKey: child.key, activeKey: activeDragKey, overKey: dragOverKey, insertAfter: dragInsertAfter, groups })}
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

  const groupCards = groups.map((group) => {
    const isCollapsed = !!collapsed[group.key];
    const isUnscheduled = group.sprintName === null;
    const filterActive = unpointedFilterKey === group.key;
    // Match the warning: unpointed stories only when this is the active sprint,
    // plus any deprecated-with-points tickets.
    const visibleItems = filterActive
      ? group.items.filter((c) => (group.isActive && isUnpointedChild(c)) || isDeprecatedWithSpChild(c))
      : group.items;
    const header = (
      <GroupStatBar
        tickets={group.items.map(toStatTicket)}
        label={group.label}
        isActive={group.isActive}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => toggle(group.key)}
        showStatusCounts={false}
        showBvAvg={false}
        activeCriterion={filterActive ? "unpointed" : null}
        onFilterChange={(c) => {
          setUnpointedFilterKey(c ? group.key : null);
          // Expand the group so the filtered rows are actually visible.
          if (c) setCollapsed((prev) => ({ ...prev, [group.key]: false }));
        }}
        leadingIcon={
          isUnscheduled
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
      !!onCreateChild && group.state !== "closed" && !(group.sprintName !== null && createSprintId === undefined);
    const isComposerOpen = composerGroupKey === group.key;

    const headerExtras =
      group.state || group.dateRange || canCreate ? (
        <>
          {group.state && <SprintStateChip state={group.state} />}
          {group.dateRange && (
            <span className="flex items-center gap-1 text-[11px] text-text-muted">
              <CalendarRange size={11} strokeWidth={1.5} /> {group.dateRange}
            </span>
          )}
          {canCreate && (
            <button
              type="button"
              aria-label={`Create issue in ${group.label}`}
              onClick={(e) => {
                e.stopPropagation();
                openComposer(group.key);
              }}
              className={`flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-text-muted [transition:opacity_.12s_ease,color_.12s_ease,background-color_.12s_ease] hover:bg-overlay-subtle hover:text-text-secondary focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                isComposerOpen ? "opacity-100" : "opacity-0 group-hover/grouprow:opacity-100"
              }`}
            >
              <Plus size={14} strokeWidth={1.75} />
            </button>
          )}
        </>
      ) : undefined;
    // Sortable ids are the non-pending rows actually rendered in this group, so
    // dnd targets line up with the SortableContext's item list.
    const sortableIds = dndEnabled
      ? visibleItems.filter((c) => !c.key.startsWith("pending-")).map((c) => c.key)
      : [];
    const rows = visibleItems.map((child, idx) => renderRow(child, group, idx, visibleItems.length));
    const body = (
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
            dropUp
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
          collisionDetection={pointerWithin}
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

      {rowMenu && onMoveChild && (
        <CursorMenu x={rowMenu.x} y={rowMenu.y} onClose={() => setRowMenu(null)}>
          <TicketActionMenuContent
            onMoveSprint={(sprintId) => onMoveChild(rowMenu.childKey, sprintId)}
            sprints={sprints}
            close={() => setRowMenu(null)}
          />
        </CursorMenu>
      )}
    </>
  );
}
