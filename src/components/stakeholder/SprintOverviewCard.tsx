"use client";

import { useState, useCallback, useMemo } from "react";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import { ProgressBar } from "./ProgressBar";
import { TicketGroup } from "./TicketGroup";
import { SprintHealthBanner } from "./SprintHealthBanner";
import { EpicFilterChips } from "./EpicFilterChips";

interface SprintOverviewCardProps {
  sprint: StakeholderSprint;
  doneTickets: StakeholderTicket[];
  inReviewTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  deprecatedTickets: StakeholderTicket[];
  carriedKeys?: Set<string>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function SprintStateBadge({ state }: { state: string }) {
  if (state === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--color-brand-500)]/15 px-2 py-0.5 text-caption font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-400)]/80">
        Active
      </span>
    );
  }
  if (state === "closed") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-0.5 text-caption font-semibold uppercase tracking-[0.1em] text-emerald-400/60">
        History
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-caption font-semibold uppercase tracking-[0.1em] text-white/30">
      Planned
    </span>
  );
}

function SectionHeader({
  label,
  count,
  pts,
  color,
}: {
  label: string;
  count: number;
  pts: number;
  color: "green" | "amber" | "brand" | "muted";
}) {
  const styles = {
    green: {
      heading: "text-emerald-400/70",
      line: "bg-emerald-400/10",
      badge: "bg-emerald-400/10 text-emerald-400/60",
    },
    amber: {
      heading: "text-amber-400/70",
      line: "bg-amber-400/10",
      badge: "bg-amber-400/10 text-amber-400/60",
    },
    brand: {
      heading: "text-[var(--color-brand-400)]/70",
      line: "bg-[var(--color-brand-400)]/10",
      badge: "bg-[var(--color-brand-400)]/10 text-[var(--color-brand-400)]/60",
    },
    muted: {
      heading: "text-white/30",
      line: "bg-white/[0.04]",
      badge: "bg-white/[0.06] text-white/30",
    },
  }[color];

  return (
    <h3 className={`mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] ${styles.heading}`}>
      <span className={`h-px flex-1 ${styles.line}`} />
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-caption tabular-nums ${styles.badge}`}>
        {count}
      </span>
      {pts > 0 && (
        <span className="text-caption tabular-nums opacity-60">{pts}pt</span>
      )}
    </h3>
  );
}

function pts(tickets: StakeholderTicket[]): number {
  return tickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
}

export function SprintOverviewCard({
  sprint,
  doneTickets,
  inReviewTickets,
  inProgressTickets,
  todoTickets,
  deprecatedTickets,
  carriedKeys,
}: SprintOverviewCardProps) {
  const isClosed = sprint.state === "closed";
  const isActive = sprint.state === "active";

  const [selectedEpics, setSelectedEpics] = useState<Set<string>>(new Set());

  const handleToggleEpic = useCallback((epic: string) => {
    setSelectedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epic)) next.delete(epic);
      else next.add(epic);
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => setSelectedEpics(new Set()), []);

  function filterByEpic(tickets: StakeholderTicket[]): StakeholderTicket[] {
    if (selectedEpics.size === 0) return tickets;
    return tickets.filter((t) => selectedEpics.has(t.epic ?? "Other"));
  }

  const allTickets = useMemo(
    () => [...doneTickets, ...inReviewTickets, ...inProgressTickets, ...todoTickets, ...deprecatedTickets],
    [doneTickets, inReviewTickets, inProgressTickets, todoTickets, deprecatedTickets],
  );

  const filteredDone = filterByEpic(doneTickets);
  const filteredInReview = filterByEpic(inReviewTickets);
  const filteredInProgress = filterByEpic(inProgressTickets);
  const filteredTodo = filterByEpic(todoTickets);
  const filteredDeprecated = filterByEpic(deprecatedTickets);

  const donePoints = pts(doneTickets);
  const inReviewPoints = pts(inReviewTickets);
  const inProgressPoints = pts(inProgressTickets);
  const todoPoints = pts(todoTickets);
  const totalPoints = donePoints + inReviewPoints + inProgressPoints + todoPoints;

  const showCompleted = doneTickets.length > 0;
  const showInReview = inReviewTickets.length > 0;
  const showInProgress = inProgressTickets.length > 0;
  const showTodo = !isClosed && todoTickets.length > 0;
  const showProgress = totalPoints > 0;

  const dateLabel =
    sprint.startDate && sprint.endDate
      ? `${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}`
      : null;

  const visibleColumns = [showCompleted, showInReview, showInProgress, showTodo].filter(Boolean).length;
  const gridClass =
    visibleColumns <= 1 ? "" :
    visibleColumns === 2 ? "grid gap-10 sm:grid-cols-2" :
    visibleColumns === 3 ? "grid gap-10 sm:grid-cols-2 lg:grid-cols-3" :
    "grid gap-10 sm:grid-cols-2 lg:grid-cols-4";

  const itemParts: string[] = [];
  if (doneTickets.length > 0) itemParts.push(`${doneTickets.length} done`);
  if (inReviewTickets.length > 0) itemParts.push(`${inReviewTickets.length} testing`);
  if (inProgressTickets.length > 0) itemParts.push(`${inProgressTickets.length} in progress`);
  if (!isClosed && todoTickets.length > 0) itemParts.push(`${todoTickets.length} to do`);

  return (
    <div className="space-y-8">
      {/* Sprint meta: state badge + dates + days remaining */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SprintStateBadge state={sprint.state} />
        {dateLabel && (
          <span className="text-sm text-white/40">{dateLabel}</span>
        )}
        {isActive && sprint.workingDaysRemaining !== null && (
          <span
            className={`text-sm font-medium ${
              sprint.workingDaysRemaining <= 2 ? "text-amber-400/80" : "text-white/40"
            }`}
          >
            {sprint.workingDaysRemaining === 0
              ? "Last working day"
              : `${sprint.workingDaysRemaining} working day${sprint.workingDaysRemaining === 1 ? "" : "s"} remaining`}
          </span>
        )}
        {sprint.goal && (
          <div className="w-full border-l-2 border-[var(--color-brand-400)]/25 pl-3 py-1">
            <p className="text-sm italic text-white/40">{sprint.goal}</p>
          </div>
        )}
      </div>

      {/* Health banner — only for active sprints */}
      <SprintHealthBanner
        sprint={sprint}
        doneTickets={doneTickets}
        inProgressTickets={[...inReviewTickets, ...inProgressTickets]}
        todoTickets={todoTickets}
      />

      {/* Progress: story points bar + ticket count summary */}
      {showProgress && (
        <div className="space-y-2">
          <ProgressBar
            completed={donePoints}
            inReview={inReviewPoints}
            inProgress={inProgressPoints}
            total={totalPoints}
          />
          {itemParts.length > 0 && (
            <p className="text-xs text-white/30 tabular-nums">
              {itemParts.join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Epic filter chips — only when 2+ distinct epics */}
      <EpicFilterChips
        tickets={allTickets}
        selectedEpics={selectedEpics}
        onToggle={handleToggleEpic}
        onClearAll={handleClearAll}
      />

      {/* Ticket columns */}
      <div className={gridClass}>
        {showCompleted && (
          <section>
            <SectionHeader label="Completed" count={filteredDone.length} pts={pts(filteredDone)} color="green" />
            <TicketGroup tickets={filteredDone} carriedKeys={carriedKeys} />
          </section>
        )}
        {showInReview && (
          <section>
            <SectionHeader label="Testing" count={filteredInReview.length} pts={pts(filteredInReview)} color="amber" />
            <TicketGroup tickets={filteredInReview} showAssignee carriedKeys={carriedKeys} />
          </section>
        )}
        {showInProgress && (
          <section>
            <SectionHeader label="In Progress" count={filteredInProgress.length} pts={pts(filteredInProgress)} color="brand" />
            <TicketGroup tickets={filteredInProgress} showAssignee carriedKeys={carriedKeys} />
          </section>
        )}
        {showTodo && (
          <section>
            <SectionHeader label="To Do" count={filteredTodo.length} pts={pts(filteredTodo)} color="muted" />
            <TicketGroup tickets={filteredTodo} carriedKeys={carriedKeys} />
          </section>
        )}
      </div>

      {/* Deprecated tickets — always at the bottom, separate from main columns */}
      {filteredDeprecated.length > 0 && (
        <div className="border-t border-border-subtle pt-6">
          <SectionHeader label="Deprecated" count={filteredDeprecated.length} pts={pts(filteredDeprecated)} color="muted" />
          <TicketGroup tickets={filteredDeprecated} carriedKeys={carriedKeys} />
        </div>
      )}
    </div>
  );
}
