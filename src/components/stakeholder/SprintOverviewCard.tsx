"use client";

import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import { ProgressBar } from "./ProgressBar";
import { TicketGroup } from "./TicketGroup";

interface SprintOverviewCardProps {
  sprint: StakeholderSprint;
  doneTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function SprintOverviewCard({
  sprint,
  doneTickets,
  inProgressTickets,
  todoTickets,
}: SprintOverviewCardProps) {
  const allTickets = [...doneTickets, ...inProgressTickets, ...todoTickets];
  const totalPoints = allTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const donePoints = doneTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  const dateLabel =
    sprint.startDate && sprint.endDate
      ? `${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}`
      : null;

  return (
    <div className="space-y-8">
      {/* Sprint meta */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        {dateLabel && (
          <span className="text-sm text-white/40">{dateLabel}</span>
        )}
        {sprint.daysRemaining !== null && (
          <span className={`text-sm font-medium ${sprint.daysRemaining <= 2 ? "text-amber-400/80" : "text-white/40"}`}>
            {sprint.daysRemaining === 0
              ? "Last day"
              : `${sprint.daysRemaining} day${sprint.daysRemaining === 1 ? "" : "s"} remaining`}
          </span>
        )}
        {sprint.goal && (
          <p className="w-full text-sm italic text-white/40">{sprint.goal}</p>
        )}
      </div>

      <ProgressBar completed={donePoints} total={totalPoints} />

      {/* Ticket sections */}
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-400/70">
            <span className="h-px flex-1 bg-emerald-400/10" />
            Completed
            <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] tabular-nums text-emerald-400/60">
              {doneTickets.length}
            </span>
          </h3>
          <TicketGroup tickets={doneTickets} />
        </section>

        <section>
          <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-400)]/70">
            <span className="h-px flex-1 bg-[var(--color-brand-400)]/10" />
            In Progress
            <span className="rounded-full bg-[var(--color-brand-400)]/10 px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-brand-400)]/60">
              {inProgressTickets.length}
            </span>
          </h3>
          <TicketGroup tickets={inProgressTickets} showAssignee />
        </section>

        <section>
          <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-white/30">
            <span className="h-px flex-1 bg-white/[0.04]" />
            To Do
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-white/30">
              {todoTickets.length}
            </span>
          </h3>
          <TicketGroup tickets={todoTickets} />
        </section>
      </div>
    </div>
  );
}
