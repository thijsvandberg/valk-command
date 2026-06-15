"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { Sprint } from "@/types/ticket";
import { Layers, Plus, Inbox, ChevronsDownUp, ChevronsUpDown, Bookmark, ChevronDown, Check, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SavedView, SortField, SortDir } from "./FilterBar";
import { UnifiedControlsCluster } from "@/components/sprint-board/UnifiedControlsCluster";
import type { FilterControlsPanelProps } from "@/components/sprint-board/FilterControlsPanel";
import type { GroupByOption } from "./useGroupBy";
import { SprintSelector } from "./SprintSelector";
import { isBacklogSprintName } from "@/lib/sprint-utils";
import { BarContainer } from "@/components/shared/BarContainer";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// -- Sortable tab item --

function SortableTab({
  sprintId,
  sprint,
  isActive,
  onClick,
  onContextMenu,
}: {
  sprintId: string;
  sprint: Sprint;
  isActive: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sprintId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.7 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative flex h-full items-stretch">
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`group relative flex h-7 self-center items-center gap-1.5 rounded-lg px-3 text-body-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          isActive
            ? "font-semibold text-[var(--color-brand-600)]"
            : "font-medium text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
        }`}
        style={{
          transition: "color 120ms, background-color 150ms",
          backgroundColor: isActive ? "color-mix(in srgb, var(--color-brand-500) 14%, transparent)" : undefined,
        }}
        {...attributes}
        {...listeners}
      >
        {sprint.state === "backlog" ? (
          <Inbox className={`h-3 w-3 ${isActive ? "text-[var(--color-brand-500)]" : "text-text-muted"}`} strokeWidth={1.5} />
        ) : sprint.state === "active" ? (
          <span
            className={`h-[7px] w-[7px] rounded-full ${isActive ? "bg-[var(--color-status-success)]" : "bg-overlay-strong"}`}
            style={isActive ? { boxShadow: "0 0 7px var(--color-status-success)" } : undefined}
          />
        ) : null}
        {sprint.name}
      </button>
    </div>
  );
}


// -- Group by dropdown (All view only) --

const GROUP_BY_OPTIONS: { value: GroupByOption; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sprint", label: "Sprint" },
  { value: "epic", label: "Epic" },
];

function GroupByDropdown({ value, onChange }: { value: GroupByOption; onChange: (v: GroupByOption) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const isActive = value !== "none";
  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="md"
        iconOnly
        onClick={() => setOpen(!open)}
        icon={
          <span className="relative flex items-center justify-center">
            <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
            {isActive && (
              <span className="absolute -top-0.5 -right-1 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-base)]" />
            )}
          </span>
        }
        title={isActive ? `Group by: ${value}` : "Group by"}
        aria-label={isActive ? `Group by: ${value}` : "Group by"}
        className={isActive ? "border-0 bg-transparent text-[var(--color-brand-400)] hover:bg-hover-list-item" : "border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"}
      />
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-36 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item ${
                opt.value === value ? "text-text-primary bg-overlay-subtle" : "text-text-secondary"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${opt.value === value ? "bg-[var(--color-brand-400)]" : "opacity-0"}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Backlogs dropdown (BRDG-319) --
// All backlog-named sprints (+ the synthetic Backlog) collapse here instead of
// crowding the numbered-sprint row. Sourced from the full sprint list, so unpinned
// team backlogs (GXP, BO, ...) are reachable without taking a pinned slot.

function BacklogsDropdown({
  backlogSprints,
  activeBacklogId,
  onSelect,
  onOpenSprintList,
  onCreateSprint,
}: {
  backlogSprints: Sprint[];
  activeBacklogId: string | null;
  onSelect: (sprintId: string) => void;
  onOpenSprintList?: (anchor: { top: number; left: number }) => void;
  onCreateSprint?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const hasSprintActions = Boolean(onOpenSprintList || onCreateSprint);
  if (backlogSprints.length === 0 && !hasSprintActions) return null;
  const active = backlogSprints.find((s) => s.id === activeBacklogId) ?? null;

  // Only the PO's own team backlog (BT) leads with an icon; the team-less Backlog
  // and the other team backlogs sit below the divider as a plain, icon-free list so
  // a column of identical Inbox glyphs no longer reads as noise (BRDG-319).
  const bt = backlogSprints.find((s) => /^bt:\s*backlog$/i.test(s.name.trim())) ?? null;
  const plain = backlogSprints.find((s) => s.id === "__backlog__") ?? null;
  const primary = [bt].filter((s): s is Sprint => s !== null);
  const primaryIds = new Set(primary.map((s) => s.id));
  const others = backlogSprints.filter((s) => !primaryIds.has(s.id) && s.id !== plain?.id);
  const rest = [plain, ...others].filter((s): s is Sprint => s !== null);

  const row = (s: Sprint, showIcon: boolean) => {
    const isActive = s.id === activeBacklogId;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => { onSelect(s.id); setOpen(false); }}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body-sm cursor-pointer hover:bg-hover-list-item ${
          isActive ? "text-text-primary" : showIcon ? "font-medium text-text-secondary" : "text-text-tertiary"
        }`}
      >
        {showIcon && <Inbox className="h-3.5 w-3.5 shrink-0 text-text-secondary" strokeWidth={1.5} />}
        <span className="flex-1 truncate">{s.name}</span>
        {s.ticketCount > 0 && <span className="text-[11px] tabular-nums text-text-muted">{s.ticketCount}</span>}
        {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand-400)]" strokeWidth={2} />}
      </button>
    );
  };

  return (
    <div ref={ref} className="relative shrink-0 self-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Backlogs"
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-body-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          active
            ? "border-border-strong text-text-primary"
            : "border-border-default text-text-tertiary hover:border-border-strong hover:text-text-secondary"
        }`}
        style={{ transition: "color 120ms, border-color 150ms", backgroundColor: active ? "color-mix(in srgb, var(--color-text-primary) 4%, transparent)" : undefined }}
      >
        <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
        <span>{active ? active.name : "Backlogs"}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-[60vh] w-56 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-1 shadow-[var(--shadow-lg)]">
          {primary.map((s) => row(s, true))}
          {primary.length > 0 && rest.length > 0 && <div className="my-1 h-px bg-border-subtle" />}
          {rest.map((s) => row(s, false))}{/* icon-free list */}
          {/* Sprint management actions fold in here so the bar carries one navigator
              instead of a separate overflow button (BRDG-319) */}
          {hasSprintActions && (
            <>
              {backlogSprints.length > 0 && <div className="my-1 h-px bg-border-subtle" />}
              {onOpenSprintList && (
                <button
                  type="button"
                  onClick={() => {
                    // Anchor the sprint-list popover under the dropdown (which sits on the
                    // left of the bar), left-aligned and clamped so its 384px width stays
                    // on-screen.
                    const r = ref.current?.getBoundingClientRect();
                    if (r) onOpenSprintList({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 384 - 8)) });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary"
                >
                  <Waypoints className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />
                  Sprint list
                </button>
              )}
              {onCreateSprint && (
                <button
                  type="button"
                  onClick={() => { onCreateSprint(); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary"
                >
                  <Plus className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />
                  New sprint
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// -- Saved views menu (BRDG-319) --
// Saved filters/presets (incl. the built-in "Overall refinement") live behind a
// bookmark menu instead of inline tabs, so they scale and stay out of the way.

function SavedViewsMenu({
  savedViews,
  activeViewId,
  onViewClick,
  onSaveCurrentView,
}: {
  savedViews: SavedView[];
  activeViewId: string | null;
  onViewClick?: (view: SavedView) => void;
  onSaveCurrentView?: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => { setOpen(false); setNaming(false); }, { enabled: open });

  const active = savedViews.find((v) => v.id === activeViewId) ?? null;

  function commitSave() {
    const t = title.trim();
    if (t && onSaveCurrentView) onSaveCurrentView(t);
    setTitle(""); setNaming(false); setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0 self-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Saved filters"
        className={`group flex h-7 items-center gap-1.5 rounded-md px-2 text-body-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          active
            ? "font-semibold text-[var(--color-brand-600)]"
            : "font-medium text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
        }`}
        style={{
          transition: "color 120ms, background-color 150ms",
          backgroundColor: active ? "color-mix(in srgb, var(--color-brand-400) 18%, transparent)" : undefined,
        }}
      >
        <Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} fill={active ? "currentColor" : "none"} />
        <span className="hidden sm:inline">{active ? active.title : "Saved"}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-1 shadow-[var(--shadow-lg)]">
          {savedViews.length === 0 && !naming && (
            <p className="px-2.5 py-2 text-body-sm text-text-muted">No saved filters yet</p>
          )}
          {savedViews.map((view) => {
            const isActive = view.id === activeViewId;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => { onViewClick?.(view); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body-sm cursor-pointer hover:bg-hover-list-item ${isActive ? "text-text-primary" : "text-text-secondary"}`}
              >
                <Bookmark className="h-3.5 w-3.5 shrink-0 text-text-tertiary" strokeWidth={1.5} />
                <span className="flex-1 truncate">{view.title}</span>
                {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand-400)]" strokeWidth={2} />}
              </button>
            );
          })}
          {onSaveCurrentView && (
            <>
              <div className="my-1 h-px bg-border-subtle" />
              {naming ? (
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitSave(); else if (e.key === "Escape") { setNaming(false); setTitle(""); } }}
                  onBlur={commitSave}
                  placeholder="View name…"
                  className="w-full rounded-md border border-border-strong bg-transparent px-2.5 py-1.5 text-body-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-[var(--color-brand-400)]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-body-sm text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-text-tertiary" strokeWidth={1.5} />
                  Save current view…
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// -- Scroll overflow detection for fade indicators --

function useScrollOverflow(ref: React.RefObject<HTMLElement | null>) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [ref, check]);

  return { canScrollLeft, canScrollRight };
}

export function SprintSlots({
  slotSprints,
  pillSlotSprints,
  activeSprintId = null,
  allActive,
  sprints,
  backlogCount = 0,
  backlogSprints = [],
  activeBacklogId = null,
  onBacklogSelect,
  onSlotClick,
  onAllClick,
  editingSlot,
  onSlotEdit,
  onSprintSelect,
  onEditClose,
  onReorderSlots,
  ephemeralSprintId = null,
  ephemeralIsActive = false,
  onEphemeralClick,
  activeFilterCount = 0,
  savedViews = [],
  activeViewId = null,
  onViewClick,
  onSaveCurrentView,
  sortField,
  sortDir,
  onSortChange,
  searchQuery,
  onSearchChange,
  searchCount,
  filterProps,
  groupBy,
  onGroupByChange,
  onCreateSprint,
  onOpenSprintList,
  groupCount = 0,
  allGroupsCollapsed = false,
  onToggleCollapseAll,
}: {
  slotSprints: string[];
  pillSlotSprints: string[];
  activeSprintId?: string | null;
  allActive: boolean;
  sprints: Sprint[];
  backlogCount?: number;
  backlogSprints?: Sprint[];
  activeBacklogId?: string | null;
  onBacklogSelect?: (sprintId: string) => void;
  onSlotClick: (idx: number) => void;
  onAllClick: () => void;
  editingSlot: number | null;
  onSlotEdit: (idx: number) => void;
  onSprintSelect: (sprintId: string) => void;
  onEditClose: () => void;
  onReorderSlots: (activeId: string, overId: string) => void;
  ephemeralSprintId?: string | null;
  ephemeralIsActive?: boolean;
  onEphemeralClick?: () => void;
  activeFilterCount?: number;
  savedViews?: SavedView[];
  activeViewId?: string | null;
  onViewClick?: (view: SavedView) => void;
  onSaveCurrentView?: (title: string) => void;
  sortField?: SortField;
  sortDir?: SortDir;
  onSortChange?: (field: SortField, dir: SortDir) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  searchCount?: { matched: number; total: number };
  filterProps?: FilterControlsPanelProps;
  groupBy?: GroupByOption;
  onGroupByChange?: (v: GroupByOption) => void;
  onCreateSprint?: () => void;
  onOpenSprintList?: (anchor: { top: number; left: number }) => void;
  groupCount?: number;
  allGroupsCollapsed?: boolean;
  onToggleCollapseAll?: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight } = useScrollOverflow(scrollRef);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderSlots(String(active.id), String(over.id));
    }
  }

  return (
    <BarContainer>
      {/* All tab -- fixed leading, filled pill, brand-tinted bg */}
      <button
        type="button"
        onClick={onAllClick}
        className={`group relative mr-2 flex shrink-0 items-center self-center h-7 rounded-md px-2.5 text-body-sm font-semibold tracking-wide cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
          allActive
            ? "text-[var(--color-brand-600)]"
            : "text-[var(--color-brand-500)] hover:text-[var(--color-brand-600)]"
        }`}
        style={{
          transition: "color 120ms, background-color 150ms",
          backgroundColor: allActive
            ? "color-mix(in srgb, var(--color-brand-400) 18%, transparent)"
            : "color-mix(in srgb, var(--color-brand-400) 12%, transparent)",
        }}
        title="Show all tickets across sprints"
      >
        All
      </button>

      {/* Backlogs dropdown -- fixed leading, kept OUTSIDE the horizontal scroller so its
          menu is not clipped by overflow-x (BRDG-319) */}
      {onBacklogSelect && (
        <BacklogsDropdown backlogSprints={backlogSprints} activeBacklogId={activeBacklogId} onSelect={onBacklogSelect} onOpenSprintList={onOpenSprintList} onCreateSprint={onCreateSprint} />
      )}

      {/* Scrollable sprint-pill area with fade indicators. The scroller hugs its
          content (no flex-grow) so the overflow/Saved zone sits right after the pills;
          the view-tools float right via ml-auto. When pills overflow, min-w-0 lets the
          scroller shrink and scroll instead of stretching the bar. A left margin keeps
          breathing room from the Backlogs dropdown now the divider is gone. */}
      <div className={`relative flex min-w-0 h-full items-stretch ${pillSlotSprints.length > 0 ? "ml-4" : ""}`}>
        {/* Left fade */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-r from-[var(--color-surface-base)] to-transparent" />
        )}
        {/* Right fade */}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-l from-[var(--color-surface-base)] to-transparent" />
        )}
      <div ref={scrollRef} className="flex min-w-0 h-full items-stretch gap-1 xl:gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={pillSlotSprints}
          strategy={horizontalListSortingStrategy}
        >
          {pillSlotSprints.map((sprintId) => {
            const sprint = sprints.find((s) => s.id === sprintId);
            if (!sprint) return null;
            // Active/edit stay index-based against the persisted slot array; the
            // pill row is a filtered view of it (backlogs/Overall refinement pulled out).
            const slotIdx = slotSprints.indexOf(sprintId);
            const isActive = !activeViewId && sprintId === activeSprintId;
            return (
              <div key={sprintId} className="relative shrink-0 flex h-full items-stretch">
                <SortableTab
                  sprintId={sprintId}
                  sprint={sprint}
                  isActive={isActive}
                  onClick={() => onSlotClick(slotIdx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSlotEdit(slotIdx);
                  }}
                />
                {editingSlot === slotIdx && (
                  <SprintSelector
                    sprints={sprints}
                    backlogCount={backlogCount}
                    onSelect={onSprintSelect}
                    onClose={onEditClose}
                  />
                )}
              </div>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Ephemeral (unpinned) sprint tab -- backlogs surface via the Backlogs dropdown instead */}
      {ephemeralSprintId && (() => {
        const eSprint = sprints.find((s) => s.id === ephemeralSprintId);
        if (!eSprint || isBacklogSprintName(eSprint.name)) return null;
        return (
          <button
            type="button"
            onClick={onEphemeralClick}
            title="Temporary view -- not pinned"
            className={`group relative flex shrink-0 items-center gap-1.5 px-2.5 text-body-sm font-medium cursor-pointer ${
              ephemeralIsActive
                ? "text-text-secondary"
                : "text-text-muted hover:text-text-secondary"
            }`}
            style={{ transition: "color 120ms" }}
          >
            {eSprint.state === "active" && (
              <span className={`h-[7px] w-[7px] rounded-full ${ephemeralIsActive ? "bg-[var(--color-brand-400)]/60" : "bg-overlay-strong"}`} />
            )}
            <span className="italic">{eSprint.name}</span>
            {ephemeralIsActive && (
              <span className="absolute bottom-0 left-1.5 right-1.5 h-[2px] rounded-full bg-[var(--color-brand-400)] opacity-50" />
            )}
            {!ephemeralIsActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--color-brand-400)] opacity-0 group-hover:opacity-20" style={{ transition: "opacity 150ms" }} />
            )}
          </button>
        );
      })()}
      </div>{/* end scrollable inner */}
      </div>{/* end scroll wrapper */}

      {/* Right side: view tools, pushed to the far edge. Saved views live here too,
          as a viewing tool rather than a sprint-zone neighbour (BRDG-319). */}
      <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
        <SavedViewsMenu savedViews={savedViews} activeViewId={activeViewId} onViewClick={onViewClick} onSaveCurrentView={onSaveCurrentView} />

        {/* Group by -- only visible in the All view */}
        {allActive && groupBy !== undefined && onGroupByChange && (
          <GroupByDropdown value={groupBy} onChange={onGroupByChange} />
        )}

        {/* Collapse / expand all groups -- only when grouping is active and groups exist */}
        {allActive && groupCount > 0 && onToggleCollapseAll && (
          <Button
            variant="ghost"
            size="md"
            iconOnly
            onClick={onToggleCollapseAll}
            title={allGroupsCollapsed ? "Expand all groups" : "Collapse all groups"}
            aria-label={allGroupsCollapsed ? "Expand all groups" : "Collapse all groups"}
            icon={
              allGroupsCollapsed
                ? <ChevronsUpDown className="h-3.5 w-3.5" strokeWidth={2} />
                : <ChevronsDownUp className="h-3.5 w-3.5" strokeWidth={2} />
            }
            className="border-0 bg-transparent text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
          />
        )}

        {/* Unified controls: search · sort · filter (BRDG-344). The standalone
            field-toggle, sort and filter-bar buttons fold into this one cluster. */}
        {filterProps && sortField && sortDir && onSortChange && onSearchChange && (
          <UnifiedControlsCluster
            searchQuery={searchQuery ?? ""}
            onSearchChange={onSearchChange}
            searchCount={searchCount}
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={onSortChange}
            activeFilterCount={activeFilterCount}
            filterProps={filterProps}
          />
        )}
      </div>
    </BarContainer>
  );
}
