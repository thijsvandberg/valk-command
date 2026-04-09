"use client";

import type { Sprint, Ticket } from "@/types/ticket";
import type { SavedView } from "@/components/sprint-board/FilterBar";
import { Columns2, LayoutGrid, CalendarRange, NotebookPen, Search, Bookmark } from "lucide-react";

interface SprintBoardHeaderProps {
  isAllView: boolean;
  activeView: SavedView | null;
  activeSprint: Sprint | null;
  ticketsLoading: boolean;
  tickets: Ticket[];
  allTickets: Ticket[];
  hasActiveFilters: boolean;
  totalPoints: number;
  todoCount: number;
  inProgressCount: number;
  testCount: number;
  doneCount: number;
  onCompare: () => void;
  onSearch: () => void;
  onStoryWriter: () => void;
}

export function SprintBoardHeader({
  isAllView,
  activeView,
  activeSprint,
  ticketsLoading,
  tickets,
  allTickets,
  hasActiveFilters,
  totalPoints,
  todoCount,
  inProgressCount,
  testCount,
  doneCount,
  onCompare,
  onSearch,
  onStoryWriter,
}: SprintBoardHeaderProps) {
  if (!isAllView && !activeSprint && !activeView) return null;

  return (
    <div className="relative flex items-center justify-between border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/60 px-5 py-3.5 overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-64 bg-[radial-gradient(ellipse_at_left_center,rgba(46,145,73,0.08)_0%,transparent_70%)]" />

      <div className="relative flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/20 shadow-[0_2px_12px_rgba(46,145,73,0.20),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-[var(--color-brand-500)]/25">
            {isAllView
              ? <LayoutGrid size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
              : activeView
              ? <Bookmark size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" fill="currentColor" />
              : <CalendarRange size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            }
          </div>
          <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
            {isAllView ? "All tickets" : activeView ? activeView.title : activeSprint!.name}
          </span>
        </div>

        {!ticketsLoading && (
          <>
            <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/[0.12] to-transparent shrink-0" />
            {!isAllView && !activeView && activeSprint!.dateRange && (
              <span className="text-sm text-white/30 shrink-0">{activeSprint!.dateRange}</span>
            )}
            <span className="text-sm text-white/35">
              {hasActiveFilters ? `${tickets.length} / ${allTickets.length}` : allTickets.length} items
            </span>
            {!isAllView && !activeView && totalPoints > 0 && (
              <span className="text-sm text-white/25">{totalPoints} pts</span>
            )}
            {!isAllView && !activeView && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="status-count-badge status-count-todo">{todoCount}</span>
                <span className="status-count-badge status-count-progress">{inProgressCount}</span>
                {testCount > 0 && (
                  <span className="status-count-badge status-count-test">{testCount}</span>
                )}
                <span className="status-count-badge status-count-done">{doneCount}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="relative flex items-center gap-2">
        {!isAllView && !activeView && (
          <button
            type="button"
            onClick={onCompare}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-xs text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
          >
            <Columns2 className="h-3 w-3" strokeWidth={1.5} />
            Compare
          </button>
        )}
        <button
          type="button"
          onClick={onSearch}
          className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-xs text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
          title="Search tickets (Cmd+K)"
        >
          <Search className="h-3 w-3" strokeWidth={1.5} />
          Search
        </button>
        <button
          type="button"
          onClick={onStoryWriter}
          className="flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 hover:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-[var(--color-brand-500)]/25 transition-colors duration-150 shadow-[0_2px_8px_rgba(46,145,73,0.12)]"
        >
          <NotebookPen className="h-3 w-3" strokeWidth={1.5} />
          Story writer
        </button>
      </div>
    </div>
  );
}
