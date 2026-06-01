"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useRouter } from "next/navigation";
import type { Sprint, Ticket } from "@/types/ticket";
import type { SprintStats } from "@/components/sprint-board/sprint-board-utils";
import type { SortField, SortDir, SavedView } from "@/components/sprint-board/FilterBar";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { StatusCount, SprintCompletionBar, SprintStats as SprintStatsComponent } from "@/components/sprint-board/SprintStatPill";
import { SprintStatsPopover } from "@/components/sprint-board/SprintStatsPopover";
import { SprintDetailsPopover } from "@/components/sprint-board/SprintDetailsPopover";
import { followedSprints, workspaceTasks } from "@/lib/api-client";
import { Columns2, Check, LayoutGrid, CalendarRange, NotebookPen, Search, Bookmark, MoreHorizontal, BarChart2, List, Bell, BellOff, Users, AlertTriangle, Inbox, Flag } from "lucide-react";
import dynamic from "next/dynamic";
const SprintListModal = dynamic(() => import("@/components/sprint-board/SprintListModal").then((m) => ({ default: m.SprintListModal })), { ssr: false });

interface SprintBoardHeaderProps {
  isAllView: boolean;
  activeSprint: Sprint | null;
  activeSprintId: string;
  allTickets: Ticket[];
  tickets: Ticket[];
  ticketsLoading: boolean;
  stats: SprintStats;
  sprintWorkDays: { remaining: number | null; total: number | null };
  slotSprints: string[];
  activeSlot: number;
  showToast: (message: React.ReactNode, durationMs?: number) => void;
  activeView: SavedView | null;
  sortField: SortField;
  sortDir: SortDir;
  filters: {
    statusFilter: Set<string>;
    setStatusFilter: (v: Set<string>) => void;
    gapsFilter: Set<string>;
    setGapsFilter: (v: Set<string>) => void;
    hasActiveFilters: boolean;
    resetFilters: () => void;
    setIssueTypeFilter: (v: Set<string>) => void;
    setEpicFilter: (v: Set<string>) => void;
  };
  analyticsVisible: boolean;
  setAnalyticsVisible: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowStoryWriterLauncher: (v: boolean) => void;
  setSearchModalOpen: (v: boolean) => void;
  setEditModalOpen: (v: boolean) => void;
  setCreateSprintModalOpen: (v: boolean) => void;
  handleSprintListSelect: (sprintId: string) => void;
  handleAddSlotWithSprint: (sprintId: string) => void;
  onFinishSprint: (early: boolean) => void;
}

export function SprintBoardHeader(props: SprintBoardHeaderProps) {
  const {
    isAllView, activeSprint, activeSprintId, allTickets, tickets, ticketsLoading,
    stats, sprintWorkDays, slotSprints, activeSlot, showToast,
    activeView, filters, analyticsVisible, setAnalyticsVisible,
    setShowStoryWriterLauncher, setSearchModalOpen, setEditModalOpen,
    handleSprintListSelect, handleAddSlotWithSprint, onFinishSprint,
  } = props;

  // The sprint's end date has effectively passed once no working days remain
  // (this is the same signal the completion bar surfaces as "last day").
  const endReached = sprintWorkDays.remaining !== null && sprintWorkDays.remaining <= 0;

  const router = useRouter();
  const completionBarRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [sprintsModalOpen, setSprintsModalOpen] = useState(false);
  const [statsPopoverOpen, setStatsPopoverOpen] = useState(false);
  const [detailsPopoverOpen, setDetailsPopoverOpen] = useState(false);
  const [isSprintFollowed, setIsSprintFollowed] = useState(false);
  const [goalSuggestionUrl, setGoalSuggestionUrl] = useState<string | null>(null);

  const activeSprintName = activeSprint?.name ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on dep change is intentional
    if (!activeSprintName) { setIsSprintFollowed(false); return; }
    let cancelled = false;
    followedSprints.list()
      .then((names: string[]) => { if (!cancelled) setIsSprintFollowed(names.includes(activeSprintName)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeSprintName]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on dep change is intentional
    if (!activeSprintId || activeSprintId === "__all__") { setGoalSuggestionUrl(null); return; }
    let url: string | null = null;
    try { const raw = localStorage.getItem(`sprint-goal-conv-${activeSprintId}`); if (raw) url = `/chat/${raw}`; } catch { /* ok */ }
    setGoalSuggestionUrl(url);
  }, [activeSprintId]);

  useOutsideClick(headerMenuRef, () => setHeaderMenuOpen(false), { enabled: headerMenuOpen });

  const handleToggleFollowSprint = useCallback(async () => {
    if (!activeSprintName) return;
    if (isSprintFollowed) {
      await followedSprints.unfollow(activeSprintName);
      setIsSprintFollowed(false);
    } else {
      await followedSprints.follow(activeSprintName);
      setIsSprintFollowed(true);
    }
  }, [activeSprintName, isSprintFollowed]);

  const { todoCount, inProgressCount, testCount, doneCount, totalPoints, noPointsCount, bvTotal, statusStats } = stats;

  return (
    <ViewHeader
      icon={isAllView ? <LayoutGrid size={15} strokeWidth={1.5} className="text-text-tertiary" />
        : activeView ? <Bookmark size={15} strokeWidth={1.5} className="text-text-tertiary" fill="currentColor" />
        : <CalendarRange size={15} strokeWidth={1.5} className="text-text-tertiary" />}
      actions={<>
          {!isAllView && !activeView && activeSprint && (
            <Button
              variant="secondary"
              size="md"
              iconOnly
              icon={isSprintFollowed
                ? <BellOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                : <Bell className="h-3.5 w-3.5" strokeWidth={1.5} />}
              onClick={handleToggleFollowSprint}
              title={isSprintFollowed ? "Unfollow sprint (stop UAT deploy notifications)" : "Follow sprint (get UAT deploy notifications)"}
              aria-label={isSprintFollowed ? "Unfollow sprint" : "Follow sprint"}
              className={isSprintFollowed ? "border-[var(--color-brand-500)]/40 text-[var(--color-brand-400)]" : ""}
            />
          )}
          <Button variant="soft" size="md" icon={<NotebookPen className="h-3 w-3" strokeWidth={1.5} />} onClick={() => setShowStoryWriterLauncher(true)} className="shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_12%,transparent)]">
            Story writer
          </Button>
          <Button variant="secondary" size="md" iconOnly icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => setSearchModalOpen(true)} title="Search tickets (shift+cmd+K)" aria-label="Search tickets" />
          <div ref={headerMenuRef} className="relative">
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
              onClick={() => setHeaderMenuOpen((v) => !v)}
              title="More options"
              aria-label="More options"
              className={headerMenuOpen ? "border-border-strong bg-overlay-strong text-text-secondary" : ""}
            />
            {headerMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1.5 shadow-[var(--shadow-lg)]">
                <button
                  type="button"
                  onClick={() => { setAnalyticsVisible((v: boolean) => !v); setHeaderMenuOpen(false); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 ${
                    analyticsVisible
                      ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                      : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                  }`}
                >
                  <BarChart2 size={13} strokeWidth={1.5} className="shrink-0" />
                  <span>Analytics</span>
                </button>
                {!isAllView && !activeView && (
                  <button
                    type="button"
                    onClick={() => {
                      const leftSprint = slotSprints[activeSlot] ?? slotSprints[0] ?? "";
                      const rightSprint = slotSprints.find((_, i) => i !== activeSlot) ?? slotSprints[1] ?? "";
                      router.push(`/sprint-board/compare?left=${encodeURIComponent(leftSprint)}&right=${encodeURIComponent(rightSprint)}`);
                      setHeaderMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                  >
                    <Columns2 size={13} strokeWidth={1.5} className="shrink-0" />
                    <span>Compare</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSprintsModalOpen(true); setHeaderMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                >
                  <List size={13} strokeWidth={1.5} className="shrink-0" />
                  <span>Sprints</span>
                </button>
                {!isAllView && !activeView && activeSprint && (
                  <button
                    type="button"
                    onClick={() => {
                      const team = activeSprint.name.match(/^([A-Z]+)[: ]/)?.[1] ?? "";
                      router.push(`/stakeholder?team=${team}&sprintId=${activeSprint.id}`);
                      setHeaderMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                  >
                    <Users size={13} strokeWidth={1.5} className="shrink-0" />
                    <span>Stakeholder View</span>
                  </button>
                )}
              </div>
            )}
            {sprintsModalOpen && (
              <SprintListModal
                onClose={() => setSprintsModalOpen(false)}
                onSelect={handleSprintListSelect}
                onPin={handleAddSlotWithSprint}
                pinnedIds={new Set(slotSprints)}
              />
            )}
          </div>
        </>}
      >
      <ViewHeaderTitle>
        {!isAllView && !activeView && activeSprint ? (
          activeSprint.state === "backlog" ? (
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
              {activeSprint.name}
            </span>
          ) : (
          <span className="relative inline-flex items-center">
            <button
              type="button"
              onClick={() => setDetailsPopoverOpen((v) => !v)}
              className="cursor-pointer rounded-md px-1 -mx-1 transition-colors duration-100
                hover:bg-overlay-default active:bg-overlay-strong"
            >
              {activeSprint.name}
            </button>
            {activeSprint.state === "active" && (
              <span className="relative ml-2 inline-flex h-2 w-2 shrink-0 translate-y-[-1px]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-secondary-400)] opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-secondary-400)]" />
              </span>
            )}
            <SprintDetailsPopover
              sprint={activeSprint}
              open={detailsPopoverOpen}
              onClose={() => setDetailsPopoverOpen(false)}
              onEdit={() => setEditModalOpen(true)}
              onSuggestGoal={async () => {
                setDetailsPopoverOpen(false);
                const ticketData = allTickets
                  .filter((t) => t.jiraStatus !== "DEPRECATED")
                  .map((t) => ({ key: t.key, summary: t.title, epic: t.epic ?? undefined, type: t.type, storyPoints: t.storyPoints ?? undefined }));
                try {
                  const result = await workspaceTasks.create({
                    skillName: "suggest-sprint-goal",
                    args: { sprintId: activeSprint!.id, sprintName: activeSprint!.name, tickets: JSON.stringify(ticketData) },
                  });
                  const convId = (result as Record<string, unknown>).conversationId as string | undefined;
                  if (convId) {
                    try { localStorage.setItem(`sprint-goal-conv-${activeSprint!.id}`, convId); } catch { /* ok */ }
                    router.push(`/chat/${convId}`);
                  }
                } catch {
                  showToast("Could not start suggestion. Is the workspace running?");
                }
              }}
              goalSuggestionUrl={goalSuggestionUrl}
              onCloseSprint={() => onFinishSprint(!endReached)}
            />
          </span>
          )
        ) : (
          <>
            {isAllView ? "All tickets" : activeView ? activeView.title : "Sprint Board"}
          </>
        )}
      </ViewHeaderTitle>
      {!ticketsLoading && (isAllView || activeSprint || activeView) && (
          <>
            {!isAllView && !activeView && activeSprint?.state === "active" ? (
              <>
                <ViewHeaderDivider />
                <div
                  ref={completionBarRef}
                  role="button"
                  tabIndex={0}
                  onClick={() => setStatsPopoverOpen((v) => !v)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStatsPopoverOpen((v) => !v); } }}
                  className="cursor-pointer"
                >
                  <SprintCompletionBar
                    doneSp={statusStats["DONE"]?.sp ?? 0}
                    testSp={statusStats["TEST"]?.sp ?? 0}
                    inProgressSp={statusStats["IN PROGRESS"]?.sp ?? 0}
                    totalSp={totalPoints}
                    doneBv={statusStats["DONE"]?.bv ?? 0}
                    testBv={statusStats["TEST"]?.bv ?? 0}
                    inProgressBv={statusStats["IN PROGRESS"]?.bv ?? 0}
                    totalBv={bvTotal}
                    doneItems={doneCount}
                    testItems={testCount}
                    inProgressItems={inProgressCount}
                    totalItems={allTickets.length}
                    workingDaysRemaining={sprintWorkDays.remaining}
                    totalWorkingDays={sprintWorkDays.total}
                  />
                </div>
                {noPointsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(filters.gapsFilter);
                      if (next.has("no_points")) next.delete("no_points"); else next.add("no_points");
                      filters.setGapsFilter(next);
                    }}
                    className={`flex items-center justify-center h-[18px] min-w-[18px] rounded cursor-pointer transition-[background-color,color,box-shadow] duration-150 ${
                      filters.gapsFilter.has("no_points")
                        ? "bg-amber-400/15 text-amber-500 shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-status-caution)_30%,transparent)]"
                        : "text-amber-400/50 hover:text-amber-500 hover:bg-amber-400/8"
                    }`}
                    title={`${noPointsCount} without estimate`}
                  >
                    <AlertTriangle size={10} strokeWidth={2.5} />
                  </button>
                )}
                {endReached && (
                  <Button
                    variant="soft"
                    size="sm"
                    icon={<Flag className="h-3 w-3" strokeWidth={1.75} />}
                    onClick={() => onFinishSprint(false)}
                    title="Finish this sprint"
                    className="ml-1 border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  >
                    Finish
                  </Button>
                )}
              </>
            ) : (
              <>
                <ViewHeaderDivider />
                <SprintStatsComponent
                  totalItems={filters.hasActiveFilters ? tickets.length : allTickets.length}
                  totalSp={!isAllView && !activeView ? totalPoints : 0}
                  totalBv={!isAllView && !activeView ? bvTotal : 0}
                />
              </>
            )}
            {!isAllView && !activeView && activeSprint?.state !== "active" && (
              <>
                <ViewHeaderDivider />
                <div className="flex items-center gap-1">
                  {(["TO DO", "IN PROGRESS", "TEST", "DONE"] as const).map((status) => {
                    const count = status === "TO DO" ? todoCount : status === "IN PROGRESS" ? inProgressCount : status === "TEST" ? testCount : doneCount;
                    if (count === 0 && status === "TEST") return null;
                    const active = filters.statusFilter.has(status);
                    const dimmed = filters.statusFilter.size > 0 && !active;
                    return (
                      <StatusCount
                        key={status}
                        colorKey={status}
                        label={status}
                        count={count}
                        active={active}
                        dimmed={dimmed}
                        onClick={() => {
                          const next = new Set(filters.statusFilter);
                          if (active) next.delete(status); else next.add(status);
                          filters.setStatusFilter(next);
                        }}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setStatsPopoverOpen(true)}
                  className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-100"
                  title="Sprint statistics"
                >
                  <BarChart2 size={13} strokeWidth={1.5} />
                </button>
              </>
            )}
          </>
        )}
        {statsPopoverOpen && (
          <SprintStatsPopover
            allTickets={allTickets}
            sprintId={activeSprintId}
            sprintName={activeSprint?.name}
            workingDaysRemaining={sprintWorkDays.remaining}
            totalWorkingDays={sprintWorkDays.total}
            onClose={() => setStatsPopoverOpen(false)}
            anchorRef={completionBarRef}
            onFilterStatus={(status) => {
              filters.resetFilters();
              filters.setStatusFilter(new Set([status]));
            }}
            onFilterType={(type) => {
              filters.resetFilters();
              filters.setIssueTypeFilter(new Set([type]));
            }}
            onFilterEpic={(epic) => {
              filters.resetFilters();
              filters.setEpicFilter(new Set([epic]));
            }}
          />
        )}
    </ViewHeader>
  );
}
