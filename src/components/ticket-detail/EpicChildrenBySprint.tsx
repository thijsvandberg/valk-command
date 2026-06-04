"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import type { EpicChild, Subtask, Sprint, Ticket, JiraStatus, TicketReadiness } from "@/types/ticket";
import { GroupStatBar } from "@/components/sprint-board/GroupStatBar";
import { GroupCard } from "@/components/sprint-board/GroupCard";
import { CursorMenu, TicketActionMenuContent } from "@/components/sprint-board/ticket-action-menu";
import { ChildIssueRow } from "./ChildIssueRow";
import { ChildIssueComposer } from "./ChildIssueComposer";
import { groupChildrenBySprint, type ChildGroup } from "@/lib/epic-children-grouping";
import { resolveMove } from "@/lib/epic-children-move";
import { useSessionStorage } from "@/hooks/useSessionStorage";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Zap, CircleDot, CalendarRange, GripVertical, Plus } from "lucide-react";

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

// A row that can be picked up and dropped onto another sprint group. Drag bits are
// spread onto the whole row (PointerSensor's 8px threshold keeps a plain click for
// selection), and the row also stays the keyboard activator via dnd-kit attributes.
function DraggableChildRow({
  child,
  isLast,
  sprintName,
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
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: child.key,
    data: { sprintName },
  });

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
      dndProps={{ ...attributes }}
      dragHandleSlot={
        <span
          ref={setActivatorNodeRef}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex shrink-0 cursor-grab items-center text-text-muted hover:!opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:cursor-grabbing"
          aria-label={`Move ${child.key} to another sprint`}
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
    data: { sprintName: group.sprintName, state: group.state },
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

  const dndEnabled = !!onMoveChild;

  const handleDragStart = useCallback((e: DragStartEvent) => {
    draggingRef.current = true;
    setActiveDragKey(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      draggingRef.current = false;
      setActiveDragKey(null);
      const { active, over } = e;
      if (!over || !onMoveChild) return;

      const childSprintName = (active.data.current?.sprintName ?? null) as string | null;
      const targetGroup = over.data.current as Pick<ChildGroup, "sprintName" | "state">;
      const res = resolveMove({ childSprintName, targetGroup, sprints });
      if (res.ok) {
        onMoveChild(String(active.id), res.targetSprintId);
      } else if (res.reason === "closed") {
        onMoveError?.("Cannot move into a closed sprint.");
      }
    },
    [onMoveChild, onMoveError, sprints],
  );

  const handleDragCancel = useCallback(() => {
    draggingRef.current = false;
    setActiveDragKey(null);
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
        <DraggableChildRow
          key={child.key}
          child={child}
          isLast={isLast}
          sprintName={group.sprintName}
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
    const body = (
      <>
        {visibleItems.map((child, idx) => renderRow(child, group, idx, visibleItems.length))}
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
