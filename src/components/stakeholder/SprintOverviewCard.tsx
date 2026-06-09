"use client";

import { useState, useCallback, useMemo } from "react";
import { ArrowDownWideNarrow } from "lucide-react";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import { getBvColor } from "@/types/ticket";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { ProgressBar } from "./ProgressBar";
import { TicketGroup } from "./TicketGroup";
import { SprintHealthBanner } from "./SprintHealthBanner";
import { EpicFilterChips } from "./EpicFilterChips";

type BvFilter = "all" | "high" | "medium";

interface SprintOverviewCardProps {
  sprint: StakeholderSprint;
  doneTickets: StakeholderTicket[];
  inReviewTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  deprecatedTickets: StakeholderTicket[];
  carriedKeys?: Set<string>;
  previousTickets?: StakeholderTicket[];
  /** Whether to render the SprintHealthBanner inside the card (default: true) */
  showHealthBanner?: boolean;
  /** Whether to render the sprint goal inside the card (default: true) */
  showGoal?: boolean;
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
      <span className="inline-flex items-center rounded-full bg-[var(--color-secondary-400)]/10 px-2 py-0.5 text-caption font-semibold uppercase tracking-[0.1em] text-[var(--color-secondary-400)]/60">
        History
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-overlay-default px-2 py-0.5 text-caption font-semibold uppercase tracking-[0.1em] text-text-tertiary">
      Planned
    </span>
  );
}

function SectionHeader({
  label,
  count,
  pts,
  bvTotal,
  color,
}: {
  label: string;
  count: number;
  pts: number;
  bvTotal?: number;
  color: "green" | "amber" | "brand" | "muted";
}) {
  const styles = {
    green: {
      heading: "text-emerald-400/70",
      line: "bg-emerald-400/10",
      badge: "bg-emerald-400/10 text-emerald-400/60",
    },
    amber: {
      heading: "text-[var(--color-testing-400)]/70",
      line: "bg-[var(--color-testing-400)]/10",
      badge: "bg-[var(--color-testing-400)]/10 text-[var(--color-testing-400)]/60",
    },
    brand: {
      heading: "text-[var(--color-brand-400)]/70",
      line: "bg-[var(--color-brand-400)]/10",
      badge: "bg-[var(--color-brand-400)]/10 text-[var(--color-brand-400)]/60",
    },
    muted: {
      heading: "text-text-tertiary",
      line: "bg-overlay-subtle",
      badge: "bg-overlay-default text-text-tertiary",
    },
  }[color];

  return (
    <h3 className={`mb-4 flex items-center gap-2 text-body-sm font-semibold uppercase tracking-[0.1em] ${styles.heading}`}>
      <span className={`h-px flex-1 ${styles.line}`} />
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-caption tabular-nums ${styles.badge}`}>
        {count}
      </span>
      {pts > 0 && <MetricBadge metric="sp" value={pts} tinted size="xs" />}
      {bvTotal !== undefined && bvTotal > 0 && <MetricBadge metric="bv" value={bvTotal} tinted size="xs" />}
    </h3>
  );
}

function pts(tickets: StakeholderTicket[]): number {
  return tickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
}

function bvSum(tickets: StakeholderTicket[]): number {
  return tickets
    .filter((t) => t.businessValue != null && t.businessValue >= 1)
    .reduce((s, t) => s + (t.businessValue ?? 0), 0);
}

function bvAvgCalc(tickets: StakeholderTicket[]): number | null {
  const scored = tickets.filter((t) => t.businessValue != null && t.businessValue >= 1);
  if (scored.length === 0) return null;
  return scored.reduce((s, t) => s + (t.businessValue ?? 0), 0) / scored.length;
}

function bvBandCount(tickets: StakeholderTicket[], min: number, max: number): number {
  return tickets.filter((t) => t.businessValue != null && t.businessValue >= min && t.businessValue <= max).length;
}

function sortByBv(tickets: StakeholderTicket[]): StakeholderTicket[] {
  return [...tickets].sort((a, b) => (b.businessValue ?? -1) - (a.businessValue ?? -1));
}

function filterByBvBand(tickets: StakeholderTicket[], filter: BvFilter): StakeholderTicket[] {
  if (filter === "all") return tickets;
  if (filter === "high") return tickets.filter((t) => t.businessValue != null && t.businessValue >= 5);
  return tickets.filter((t) => t.businessValue != null && t.businessValue >= 3 && t.businessValue <= 4);
}

// BV summary section, structured to mirror ProgressBar
function BvSummarySection({ tickets, previousTickets }: { tickets: StakeholderTicket[]; previousTickets?: StakeholderTicket[] }) {
  const total = bvSum(tickets);
  const avg = bvAvgCalc(tickets);
  if (total === 0) return null;

  const prevTotal = previousTickets ? bvSum(previousTickets) : null;
  const delta = prevTotal !== null && prevTotal > 0 ? total - prevTotal : null;

  const high = bvBandCount(tickets, 5, 7);
  const medium = bvBandCount(tickets, 3, 4);
  const low = bvBandCount(tickets, 1, 2);
  const bandTotal = high + medium + low;

  const highColor = getBvColor(7);
  const medColor = getBvColor(3);
  const lowColor = getBvColor(1);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-body-lg text-text-secondary">Business value</span>
        <div className="flex items-baseline gap-2">
          {avg !== null && (
            <span className="text-body-sm text-text-muted tabular-nums">avg {avg.toFixed(1)}</span>
          )}
          {delta !== null && (
            <span className={`text-body-sm tabular-nums ${delta > 0 ? "text-emerald-400/70" : delta < 0 ? "text-amber-400/70" : "text-text-muted"}`}>
              {delta > 0 ? "+" : ""}{delta} vs prev
            </span>
          )}
          <span className="text-body-lg font-medium tabular-nums text-text-secondary">{total}</span>
        </div>
      </div>
      {bandTotal > 0 && (
        <>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-overlay-default">
            {high > 0 && (
              <div
                className="h-full transition-[width] duration-700 ease-out"
                style={{ width: `${(high / bandTotal) * 100}%`, backgroundColor: highColor.solid, opacity: 0.7 }}
                title={`High value (5-7): ${high}`}
              />
            )}
            {medium > 0 && (
              <div
                className="h-full transition-[width] duration-700 ease-out"
                style={{ width: `${(medium / bandTotal) * 100}%`, backgroundColor: medColor.solid, opacity: 0.5 }}
                title={`Medium value (3-4): ${medium}`}
              />
            )}
            {low > 0 && (
              <div
                className="h-full transition-[width] duration-700 ease-out"
                style={{ width: `${(low / bandTotal) * 100}%`, backgroundColor: lowColor.solid, opacity: 0.35 }}
                title={`Low value (1-2): ${low}`}
              />
            )}
          </div>
          <div className="flex items-center gap-3 text-caption text-text-muted">
            {high > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: highColor.solid }} />
                {high} high
              </span>
            )}
            {medium > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: medColor.solid }} />
                {medium} medium
              </span>
            )}
            {low > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lowColor.solid }} />
                {low} low
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Top value items highlight
function TopValueItems({ tickets }: { tickets: StakeholderTicket[] }) {
  const topItems = tickets
    .filter((t) => t.businessValue != null && t.businessValue >= 5)
    .sort((a, b) => (b.businessValue ?? 0) - (a.businessValue ?? 0));

  if (topItems.length === 0) return null;

  const highColor = getBvColor(7);

  return (
    <div
      className="rounded-lg border px-4 py-3 space-y-2"
      style={{ borderColor: `color-mix(in srgb, ${highColor.solid} 20%, transparent)`, backgroundColor: highColor.bg }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-caption font-semibold uppercase tracking-[0.12em]"
          style={{ color: highColor.text }}
        >
          Top value items
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-caption tabular-nums"
          style={{ color: highColor.text, backgroundColor: `color-mix(in srgb, ${highColor.solid} 15%, transparent)` }}
        >
          {topItems.length}
        </span>
      </div>
      <ul className="space-y-1">
        {topItems.map((t, i) => {
          const bvColor = getBvColor(t.businessValue!);
          return (
            <li key={i} className="flex items-center gap-2 text-body-lg">
              <span
                className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded px-1 text-[10px] font-semibold tabular-nums shrink-0"
                style={{ color: bvColor.text, backgroundColor: bvColor.bg }}
              >
                {t.businessValue}
              </span>
              <span className="text-text-secondary truncate">{t.title}</span>
              {t.assignee && (
                <span className="text-caption text-text-muted shrink-0">({t.assignee.name})</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SprintOverviewCard({
  sprint,
  doneTickets,
  inReviewTickets,
  inProgressTickets,
  todoTickets,
  deprecatedTickets,
  carriedKeys,
  previousTickets,
  showHealthBanner = true,
  showGoal = true,
}: SprintOverviewCardProps) {
  const isClosed = sprint.state === "closed";
  const isActive = sprint.state === "active";

  const [selectedEpics, setSelectedEpics] = useState<Set<string>>(new Set());
  const [bvFilter, setBvFilter] = useState<BvFilter>("all");
  const [sortByBvEnabled, setSortByBvEnabled] = useState(false);

  const handleToggleEpic = useCallback((epic: string) => {
    setSelectedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epic)) next.delete(epic);
      else next.add(epic);
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => setSelectedEpics(new Set()), []);

  function filterTickets(tickets: StakeholderTicket[]): StakeholderTicket[] {
    let result = tickets;
    if (selectedEpics.size > 0) {
      result = result.filter((t) => selectedEpics.has(t.epic ?? "Other"));
    }
    result = filterByBvBand(result, bvFilter);
    if (sortByBvEnabled) {
      result = sortByBv(result);
    }
    return result;
  }

  const allTickets = useMemo(
    () => [...doneTickets, ...inReviewTickets, ...inProgressTickets, ...todoTickets, ...deprecatedTickets],
    [doneTickets, inReviewTickets, inProgressTickets, todoTickets, deprecatedTickets],
  );

  const hasBvData = useMemo(
    () => allTickets.some((t) => t.businessValue != null && t.businessValue >= 1),
    [allTickets],
  );

  const filteredDone = filterTickets(doneTickets);
  const filteredInReview = filterTickets(inReviewTickets);
  const filteredInProgress = filterTickets(inProgressTickets);
  const filteredTodo = filterTickets(todoTickets);
  const filteredDeprecated = filterTickets(deprecatedTickets);

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
  // Cap at 3 columns per row so each column has enough width for readable text
  const gridClass =
    visibleColumns <= 1 ? "" :
    visibleColumns === 2 ? "grid gap-10 sm:grid-cols-2" :
    "grid gap-10 sm:grid-cols-2 lg:grid-cols-3";

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
          <span className="text-body-lg text-text-tertiary">{dateLabel}</span>
        )}
        {isActive && sprint.workingDaysRemaining !== null && (
          <span
            className={`text-body-lg font-medium ${
              sprint.workingDaysRemaining <= 2 ? "text-amber-400/80" : "text-text-tertiary"
            }`}
          >
            {sprint.workingDaysRemaining === 0
              ? "Last working day"
              : `${sprint.workingDaysRemaining} working day${sprint.workingDaysRemaining === 1 ? "" : "s"} remaining`}
          </span>
        )}
        {showGoal && sprint.goal && (
          <div className="w-full border-l-2 border-[var(--color-brand-400)]/25 pl-3 py-1">
            <p className="text-body-lg italic text-text-tertiary">{sprint.goal}</p>
          </div>
        )}
      </div>

      {/* Health banner */}
      {showHealthBanner && (
        <SprintHealthBanner
          sprint={sprint}
          doneTickets={doneTickets}
          inProgressTickets={[...inReviewTickets, ...inProgressTickets]}
          todoTickets={todoTickets}
        />
      )}

      {/* Metrics: Story points + Business value */}
      {(showProgress || hasBvData) && (
        <div className="space-y-6">
          {showProgress && (
            <ProgressBar
              completed={donePoints}
              inReview={inReviewPoints}
              inProgress={inProgressPoints}
              total={totalPoints}
            />
          )}
          {hasBvData && (
            <BvSummarySection tickets={allTickets} previousTickets={previousTickets} />
          )}
          {itemParts.length > 0 && (
            <p className="text-body-sm text-text-tertiary tabular-nums">
              {itemParts.join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <EpicFilterChips
        tickets={allTickets}
        selectedEpics={selectedEpics}
        onToggle={handleToggleEpic}
        onClearAll={handleClearAll}
      />
      {hasBvData && (
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "high", "medium"] as const).map((f) => {
            const labels: Record<BvFilter, string> = { all: "All", high: "High (5-7)", medium: "Medium (3-4)" };
            const active = bvFilter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setBvFilter(f)}
                className={`rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors duration-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  active
                    ? "bg-[var(--color-brand-400)]/15 text-[var(--color-brand-400)]/80"
                    : "bg-overlay-subtle text-text-muted hover:bg-overlay-default hover:text-text-tertiary"
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSortByBvEnabled((v) => !v)}
            title="Sort by business value"
            className={`ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium transition-colors duration-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              sortByBvEnabled
                ? "bg-[var(--color-brand-400)]/15 text-[var(--color-brand-400)]/80"
                : "bg-overlay-subtle text-text-muted hover:bg-overlay-default hover:text-text-tertiary"
            }`}
          >
            <ArrowDownWideNarrow size={11} strokeWidth={1.5} />
            BV
          </button>
        </div>
      )}

      {/* Top value items highlight */}
      {hasBvData && bvFilter === "all" && (
        <TopValueItems tickets={allTickets} />
      )}

      {/* Ticket columns */}
      <div className={gridClass}>
        {showCompleted && (
          <section>
            <SectionHeader label="Completed" count={filteredDone.length} pts={pts(filteredDone)} bvTotal={bvSum(filteredDone)} color="green" />
            <TicketGroup tickets={filteredDone} carriedKeys={carriedKeys} deemphasizeUnscored={hasBvData} />
          </section>
        )}
        {showInReview && (
          <section>
            <SectionHeader label="Testing" count={filteredInReview.length} pts={pts(filteredInReview)} bvTotal={bvSum(filteredInReview)} color="amber" />
            <TicketGroup tickets={filteredInReview} showAssignee carriedKeys={carriedKeys} deemphasizeUnscored={hasBvData} />
          </section>
        )}
        {showInProgress && (
          <section>
            <SectionHeader label="In Progress" count={filteredInProgress.length} pts={pts(filteredInProgress)} bvTotal={bvSum(filteredInProgress)} color="brand" />
            <TicketGroup tickets={filteredInProgress} showAssignee carriedKeys={carriedKeys} deemphasizeUnscored={hasBvData} />
          </section>
        )}
        {showTodo && (
          <section>
            <SectionHeader label="To Do" count={filteredTodo.length} pts={pts(filteredTodo)} bvTotal={bvSum(filteredTodo)} color="muted" />
            <TicketGroup tickets={filteredTodo} carriedKeys={carriedKeys} deemphasizeUnscored={hasBvData} />
          </section>
        )}
      </div>

      {/* Deprecated tickets */}
      {filteredDeprecated.length > 0 && (
        <div className="border-t border-border-subtle pt-6">
          <SectionHeader label="Deprecated" count={filteredDeprecated.length} pts={pts(filteredDeprecated)} color="muted" />
          <TicketGroup tickets={filteredDeprecated} carriedKeys={carriedKeys} />
        </div>
      )}
    </div>
  );
}
