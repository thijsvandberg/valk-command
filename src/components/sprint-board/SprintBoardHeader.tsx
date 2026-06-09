"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useRouter } from "next/navigation";
import type { Sprint, Ticket } from "@/types/ticket";
import type { SprintStats } from "@/components/sprint-board/sprint-board-utils";
import type { SortField, SortDir, SavedView } from "@/components/sprint-board/FilterBar";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { SprintCompletionBar, SprintStats as SprintStatsComponent } from "@/components/sprint-board/SprintStatPill";
import { SprintStatsPopover } from "@/components/sprint-board/SprintStatsPopover";
import { SprintDetailsPopover } from "@/components/sprint-board/SprintDetailsPopover";
import { followedSprints, workspaceTasks } from "@/lib/api-client";
import { getJiraSprintUrl } from "@/lib/jira-url";
import { Columns2, Check, LayoutGrid, CalendarRange, Search, Bookmark, MoreHorizontal, BarChart2, List, Bell, BellOff, Users, Inbox, Flag, Play, Pencil } from "lucide-react";
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
  planningVisible: boolean;
  setPlanningVisible: (v: boolean | ((prev: boolean) => boolean)) => void;
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
    activeView, filters, analyticsVisible, setAnalyticsVisible, planningVisible, setPlanningVisible,
    setSearchModalOpen, setEditModalOpen,
    handleSprintListSelect, handleAddSlotWithSprint, onFinishSprint,
  } = props;

  // The sprint's end date has effectively passed once no working days remain
  // (this is the same signal the completion bar surfaces as "last day").
  const endReached = sprintWorkDays.remaining !== null && sprintWorkDays.remaining <= 0;

  // Surface a "Start sprint" affordance on a future sprint once its start day is
  // within reach (tomorrow or earlier, including an already-passed start), and
  // keep it from then on until the sprint is actually started.
  const startReached = (() => {
    if (activeSprint?.state !== "future" || !activeSprint.startDate) return false;
    const start = new Date(activeSprint.startDate);
    if (Number.isNaN(start.getTime())) return false;
    const tomorrowEnd = new Date();
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);
    return start.getTime() <= tomorrowEnd.getTime();
  })();

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

  const { inProgressCount, testCount, doneCount, totalPoints, bvTotal, statusStats } = stats;

  return (
    <ViewHeader
      groupedActions
      icon={isAllView ? <LayoutGrid size={15} strokeWidth={1.5} className="text-text-tertiary" />
        : activeView ? <Bookmark size={15} strokeWidth={1.5} className="text-text-tertiary" fill="currentColor" />
        : <CalendarRange size={15} strokeWidth={1.5} className="text-text-tertiary" />}
      actions={<>
          <Button variant="ghost" size="md" iconOnly icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />} onClick={() => setSearchModalOpen(true)} title="Search tickets (shift+cmd+K)" aria-label="Search tickets" className="border-0 bg-transparent" />
          <div ref={headerMenuRef} className="relative">
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
              onClick={() => setHeaderMenuOpen((v) => !v)}
              title="More options"
              aria-label="More options"
              className={`border-0 bg-transparent ${headerMenuOpen ? "bg-overlay-strong text-text-secondary" : ""}`}
            />
            {headerMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1.5 shadow-[var(--shadow-lg)]">
                {!isAllView && !activeView && activeSprint && (
                  <button
                    type="button"
                    onClick={() => { handleToggleFollowSprint(); setHeaderMenuOpen(false); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 ${
                      isSprintFollowed
                        ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                        : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                    }`}
                    title={isSprintFollowed ? "Stop UAT deploy notifications" : "Get UAT deploy notifications"}
                  >
                    {isSprintFollowed
                      ? <BellOff size={13} strokeWidth={1.5} className="shrink-0" />
                      : <Bell size={13} strokeWidth={1.5} className="shrink-0" />}
                    <span>{isSprintFollowed ? "Unfollow sprint" : "Follow sprint"}</span>
                  </button>
                )}
                {!isAllView && !activeView && activeSprint && (
                  <div className="my-1 h-px bg-border-default/60" aria-hidden />
                )}
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
                <button
                  type="button"
                  onClick={() => { setPlanningVisible((v: boolean) => !v); setHeaderMenuOpen(false); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 ${
                    planningVisible
                      ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                      : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                  }`}
                >
                  <Pencil size={13} strokeWidth={1.5} className="shrink-0" />
                  <span>Planning</span>
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
              jiraUrl={getJiraSprintUrl(activeSprint.id)}
              onCloseSprint={() => onFinishSprint(!endReached)}
              onStartSprint={() => setEditModalOpen(true)}
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
                    hideStats
                  />
                </div>
                {endReached && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Flag className="h-3 w-3" strokeWidth={2} />}
                    onClick={() => onFinishSprint(false)}
                    title="Finish this sprint"
                    className="ml-2 mr-3 shrink-0"
                  >
                    Finish sprint
                  </Button>
                )}
              </>
            ) : (!isAllView && !activeView && activeSprint?.state === "future" && startReached) ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Play className="h-3 w-3" strokeWidth={2} />}
                onClick={() => setEditModalOpen(true)}
                title="Start this sprint"
                className="ml-2 mr-3 shrink-0"
              >
                Start sprint
              </Button>
            ) : (isAllView || activeView) ? (
              // All / multiple-sprint / saved (epic) views keep just the item count;
              // SP/BV live in the per-group card headers now. Single-sprint views drop
              // the top-header stats entirely since the card header repeats them.
              <>
                <ViewHeaderDivider />
                <SprintStatsComponent
                  totalItems={filters.hasActiveFilters ? tickets.length : allTickets.length}
                  totalSp={0}
                  totalBv={0}
                />
              </>
            ) : null}
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
