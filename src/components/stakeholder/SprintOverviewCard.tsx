"use client";

import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import { ProgressBar } from "./ProgressBar";
import { TicketGroup } from "./TicketGroup";

interface SprintOverviewCardProps {
  sprint: StakeholderSprint;
  doneTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  deprecatedTickets: StakeholderTicket[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function SprintStateBadge({ state }: { state: string }) {
  if (state === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-[var(--color-brand-500)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-400)]/80">
        Active
      </span>
    );
  }
  if (state === "closed") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-400/60">
        History
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/30">
      Planned
    </span>
  );
}

function SectionHeader({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "green" | "brand" | "muted";
}) {
  const styles = {
    green: {
      heading: "text-emerald-400/70",
      line: "bg-emerald-400/10",
      badge: "bg-emerald-400/10 text-emerald-400/60",
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
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${styles.badge}`}>
        {count}
      </span>
    </h3>
  );
}

export function SprintOverviewCard({
  sprint,
  doneTickets,
  inProgressTickets,
  todoTickets,
  deprecatedTickets,
}: SprintOverviewCardProps) {
  const isClosed = sprint.state === "closed";
  const isActive = sprint.state === "active";

  const allTickets = [...doneTickets, ...inProgressTickets, ...todoTickets];
  const totalPoints = allTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const donePoints = doneTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  const showCompleted = doneTickets.length > 0;
  const showInProgress = inProgressTickets.length > 0;
  // For closed sprints, don't show To Do (remaining work irrelevant after sprint ends)
  const showTodo = !isClosed && todoTickets.length > 0;
  const showProgress = totalPoints > 0;

  const dateLabel =
    sprint.startDate && sprint.endDate
      ? `${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}`
      : null;

  // Build visible column list for grid sizing
  const visibleColumns = [showCompleted, showInProgress, showTodo].filter(Boolean).length;
  const gridClass =
    visibleColumns === 1
      ? "max-w-sm"
      : visibleColumns === 2
      ? "grid gap-10 sm:grid-cols-2 max-w-3xl"
      : "grid gap-10 sm:grid-cols-2 lg:grid-cols-3";

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
          <p className="w-full text-sm italic text-white/40">{sprint.goal}</p>
        )}
      </div>

      {showProgress && <ProgressBar completed={donePoints} total={totalPoints} />}

      {/* Ticket columns */}
      <div className={gridClass}>
        {showCompleted && (
          <section>
            <SectionHeader label="Completed" count={doneTickets.length} color="green" />
            <TicketGroup tickets={doneTickets} />
          </section>
        )}
        {showInProgress && (
          <section>
            <SectionHeader label="In Progress" count={inProgressTickets.length} color="brand" />
            <TicketGroup tickets={inProgressTickets} showAssignee />
          </section>
        )}
        {showTodo && (
          <section>
            <SectionHeader label="To Do" count={todoTickets.length} color="muted" />
            <TicketGroup tickets={todoTickets} />
          </section>
        )}
      </div>

      {/* Deprecated tickets — always at the bottom, separate from main columns */}
      {deprecatedTickets.length > 0 && (
        <div className="border-t border-white/[0.04] pt-6">
          <SectionHeader label="Deprecated" count={deprecatedTickets.length} color="muted" />
          <TicketGroup tickets={deprecatedTickets} />
        </div>
      )}
    </div>
  );
}
