"use client";

// Shared pill component for sprint board stat/status chips.
// Used in both the header bar (size="md") and grouped sprint headers (size="sm").
// Two variants:
//   stat   - neutral info chip (items, pts, no pts); non-interactive or interactive
//   status - colored chip with optional dot indicator (IN PROGRESS, DONE, TO DO, TEST)

import { MetricBadge } from "@/components/shared/MetricBadge";
import { pluralize } from "@/lib/pluralize";

export type PillSize = "md" | "sm" | "badge";
export type PillVariant = "stat" | "status";

export interface StatusPillColor {
  bg: string;
  bgActive: string;
  text: string;
  textActive: string;
  ring: string;
  dot?: string;
}

// Canonical color tokens for every Jira status
export const STATUS_PILL_COLORS: Record<string, StatusPillColor> = {
  "TO DO": {
    bg: "var(--sp-todo-bg)",
    bgActive: "var(--sp-todo-active-bg)",
    text: "var(--sp-todo-text)",
    textActive: "var(--sp-todo-active-text)",
    ring: "transparent",
    dot: "var(--sp-todo-dot)",
  },
  "IN PROGRESS": {
    bg: "var(--sp-prog-bg)",
    bgActive: "var(--sp-prog-active-bg)",
    text: "var(--sp-prog-text)",
    textActive: "var(--sp-prog-active-text)",
    ring: "transparent",
    dot: "var(--sp-prog-dot)",
  },
  TEST: {
    bg: "var(--sp-test-bg)",
    bgActive: "var(--sp-test-active-bg)",
    text: "var(--sp-test-text)",
    textActive: "var(--sp-test-active-text)",
    ring: "transparent",
    dot: "var(--sp-test-dot)",
  },
  DONE: {
    bg: "var(--sp-done-bg)",
    bgActive: "var(--sp-done-active-bg)",
    text: "var(--sp-done-text)",
    textActive: "var(--sp-done-active-text)",
    ring: "transparent",
    dot: "var(--sp-done-dot)",
  },
};

// Size tokens: md for header bar, sm for group headers
const SIZE = {
  md: {
    pill: "px-2 py-0.5",
    text: "text-body-sm",       // 12px — header bar has more room
    dot: "h-1.5 w-1.5",
    gap: "gap-1.5",
    radius: "rounded",
  },
  sm: {
    pill: "px-1.5 py-0.5",
    text: "text-[10px]",   // matches --text-caption (10px)
    dot: "h-1.5 w-1.5",
    gap: "gap-1",
    radius: "rounded",
  },
  // Matches the SP/BV MetricBadge so status pills sit in the same visual family
  // as the other header-bar badges (same height, radius and 12px text).
  badge: {
    pill: "px-1.5 py-0.5",
    text: "text-body-sm",
    dot: "h-1.5 w-1.5",
    gap: "gap-1",
    radius: "rounded-md",
  },
};

interface BaseProps {
  size?: PillSize;
  className?: string;
}

// ── Stat pill ──────────────────────────────────────────────────────────────
// Neutral info chip: "15 items", "41 pts", "4 no pts".
// variant="default" → primary stat (items)
// variant="dim"     → secondary stat (pts) — slightly muted
// variant="warning" → attention item (no pts) — amber tint
// Pass onClick to make it interactive.

export type StatPillVariant = "default" | "dim" | "warning";

const STAT_VARIANT_STYLE: Record<StatPillVariant, { bg: string; text: string; activeBg: string; activeText: string; activeRing: string }> = {
  default: {
    bg: "var(--color-overlay-default)",
    text: "var(--color-text-tertiary)",
    activeBg: "var(--color-overlay-strong)",
    activeText: "var(--color-text-secondary)",
    activeRing: "var(--color-text-muted)",
  },
  dim: {
    bg: "var(--color-overlay-subtle)",
    text: "var(--color-text-muted)",
    activeBg: "var(--color-overlay-strong)",
    activeText: "var(--color-text-tertiary)",
    activeRing: "var(--color-text-muted)",
  },
  warning: {
    bg: "color-mix(in srgb, var(--color-status-caution) 6%, transparent)",
    text: "color-mix(in srgb, #d29b14 55%, transparent)",
    activeBg: "color-mix(in srgb, var(--color-status-caution) 13%, transparent)",
    activeText: "color-mix(in srgb, var(--color-status-caution) 80%, transparent)",
    activeRing: "color-mix(in srgb, var(--color-status-caution) 25%, transparent)",
  },
};

interface StatPillProps extends BaseProps {
  children: React.ReactNode;
  variant?: StatPillVariant;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}

export function StatPill({ size = "md", variant = "default", active, onClick, title, className = "", children }: StatPillProps) {
  const s = SIZE[size];
  const v = STAT_VARIANT_STYLE[variant];
  const isInteractive = !!onClick;

  const base = [
    "inline-flex items-center rounded font-medium tabular-nums shrink-0 select-none",
    s.pill,
    s.text,
  ].join(" ");

  const style: React.CSSProperties = active
    ? { backgroundColor: v.activeBg, color: v.activeText, boxShadow: `0 0 0 1px ${v.activeRing}` }
    : { backgroundColor: v.bg, color: v.text };

  if (!isInteractive) {
    return (
      <span className={`${base} ${className}`} style={style} title={title}>
        {children}
      </span>
    );
  }

  return (
    <span
      role="button"
      onClick={onClick}
      className={`${base} cursor-pointer transition-colors duration-100 ${className}`}
      style={style}
      title={title}
    >
      {children}
    </span>
  );
}

// ── Status count (compact Jira-style) ────────────────────────────────────
// Small colored number badge for the header bar. Renders just the count
// with a subtle colored bg. Full status label appears in a title tooltip.

interface StatusCountProps {
  colorKey: string;
  label: string;
  count: number;
  active?: boolean;
  dimmed?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function StatusCount({
  colorKey,
  label,
  count,
  active = false,
  dimmed = false,
  onClick,
}: StatusCountProps) {
  const colors = STATUS_PILL_COLORS[colorKey] ?? STATUS_PILL_COLORS["TO DO"];

  const style: React.CSSProperties = active
    ? {
        backgroundColor: colors.bgActive,
        color: colors.textActive,
        boxShadow: `0 0 0 1.5px ${colors.ring}, 0 1px 3px ${colors.ring}`,
      }
    : {
        backgroundColor: dimmed ? "var(--color-overlay-subtle)" : colors.bg,
        color: dimmed ? "var(--color-text-muted)" : colors.text,
      };

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded px-1.5 text-[11px] font-semibold tabular-nums shrink-0 select-none cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60"
      style={style}
    >
      {count}
    </button>
  );
}

// ── Sprint stats chips ───────────────────────────────────────────────────
// Shared component showing "X items [Y SP] [Z BV]" with pill styling.

interface SprintStatsProps {
  totalItems: number;
  totalSp: number;
  totalBv: number;
  className?: string;
}

export function SprintStats({ totalItems, totalSp, totalBv, className = "" }: SprintStatsProps) {
  return (
    <div className={`flex items-center gap-2 text-body-sm tabular-nums ${className}`}>
      <span className="text-text-tertiary">{totalItems} <span className="text-[10px]">{pluralize(totalItems, "item")}</span></span>
      {totalSp > 0 && (
        <div className="flex items-center gap-1">
          <MetricBadge metric="sp" value={totalSp} tinted />
          {totalBv > 0 && <MetricBadge metric="bv" value={totalBv} tinted />}
        </div>
      )}
    </div>
  );
}

// ── Sprint completion bar ─────────────────────────────────────────────────
// Compact header widget for active sprints. Shows a progress bar with
// switchable modes (SP / BV / Items) and sprint time progress.

import { useState } from "react";

export type CompletionMode = "sp" | "bv" | "items";

export interface SprintCompletionBarProps {
  // Per-status values
  doneSp: number;
  testSp: number;
  inProgressSp: number;
  totalSp: number;
  doneBv: number;
  testBv: number;
  inProgressBv: number;
  totalBv: number;
  doneItems: number;
  testItems: number;
  inProgressItems: number;
  totalItems: number;
  // Sprint time
  workingDaysRemaining: number | null;
  totalWorkingDays: number | null;
  // Layout overrides for embedding outside the header row (e.g. in the stats modal).
  // gridLayout makes the toggle / bar / percent render as cells of a parent
  // `grid-cols-[auto_1fr_auto]` so the bar aligns with a sibling time-progress row.
  gridLayout?: boolean;
  hideStats?: boolean;
  hideTime?: boolean;
}

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

export function SprintCompletionBar(props: SprintCompletionBarProps) {
  const [mode, setMode] = useState<CompletionMode>("sp");

  const { workingDaysRemaining, totalWorkingDays, gridLayout, hideStats, hideTime } = props;

  // Pick values based on mode
  const done = mode === "sp" ? props.doneSp : mode === "bv" ? props.doneBv : props.doneItems;
  const test = mode === "sp" ? props.testSp : mode === "bv" ? props.testBv : props.testItems;
  const prog = mode === "sp" ? props.inProgressSp : mode === "bv" ? props.inProgressBv : props.inProgressItems;
  const total = mode === "sp" ? props.totalSp : mode === "bv" ? props.totalBv : props.totalItems;

  const donePct = pct(done, total);
  const testPct = pct(test, total);
  const progPct = pct(prog, total);
  const completePct = Math.round(donePct);

  const label = mode === "sp" ? "SP" : mode === "bv" ? "BV" : "";

  // Sprint time progress
  const daysElapsed = totalWorkingDays != null && workingDaysRemaining != null ? totalWorkingDays - workingDaysRemaining : null;
  const timePct = totalWorkingDays != null && totalWorkingDays > 0 && daysElapsed != null ? Math.round((daysElapsed / totalWorkingDays) * 100) : null;

  if (total <= 0 && mode !== "items") return null;

  const modes: { key: CompletionMode; label: string }[] = [
    { key: "sp", label: "SP" },
    { key: "bv", label: "BV" },
    { key: "items", label: "#" },
  ];

  // Segment legend entries (only non-zero)
  const segments: { key: string; value: number; color: string }[] = [];
  if (done > 0) segments.push({ key: "done", value: done, color: STATUS_PILL_COLORS.DONE.dot ?? STATUS_PILL_COLORS.DONE.text });
  if (test > 0) segments.push({ key: "test", value: test, color: STATUS_PILL_COLORS.TEST.dot ?? STATUS_PILL_COLORS.TEST.text });
  if (prog > 0) segments.push({ key: "prog", value: prog, color: STATUS_PILL_COLORS["IN PROGRESS"].dot ?? STATUS_PILL_COLORS["IN PROGRESS"].text });

  const doneColor = STATUS_PILL_COLORS.DONE.dot ?? STATUS_PILL_COLORS.DONE.text;
  const testColor = STATUS_PILL_COLORS.TEST.dot ?? STATUS_PILL_COLORS.TEST.text;
  const progColor = STATUS_PILL_COLORS["IN PROGRESS"].dot ?? STATUS_PILL_COLORS["IN PROGRESS"].text;

  const BAR_W = 200;
  const TIME_W = 90;

  const hasTime = workingDaysRemaining != null && totalWorkingDays != null && totalWorkingDays > 0 && daysElapsed != null;

  // The bar visually centers in the header row. Labels hang below the bar,
  // so the bar itself must sit slightly below geometric center to look centered.
  const CONTAINER_H = 30;
  const BAR_TOP = 12;
  const LABEL_TOP = BAR_TOP + 9;

  return (
    <div className={gridLayout ? "contents select-none" : "flex items-center gap-3 select-none"} style={gridLayout ? undefined : { height: CONTAINER_H }}>
      {/* Stats: items + SP/BV chips -- hidden on narrow screens */}
      {!hideStats && (
        <SprintStats totalItems={props.totalItems} totalSp={props.totalSp} totalBv={props.totalBv} className="hidden xl:flex" />
      )}

      {/* Mode toggle */}
      <div className="flex items-center rounded h-[18px] overflow-hidden" style={{ backgroundColor: "var(--color-overlay-subtle)" }}>
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={(e) => { e.stopPropagation(); setMode(m.key); }}
            className="px-1.5 h-full text-[9px] font-semibold uppercase tracking-wide cursor-pointer transition-colors duration-100"
            style={{
              color: mode === m.key ? "var(--color-text-primary)" : "var(--color-text-muted)",
              backgroundColor: mode === m.key ? "var(--color-overlay-strong)" : "transparent",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Progress bar with counts below */}
      <div className={gridLayout ? "relative" : "relative self-stretch"} style={gridLayout ? { height: CONTAINER_H } : { width: BAR_W }}>
        <div className="absolute left-0 right-0 h-[5px] overflow-hidden rounded-full" style={{ top: BAR_TOP, backgroundColor: "var(--color-overlay-default)" }}>
          <div
            className="absolute inset-y-0 left-0 rounded-l-full transition-[width] duration-500 ease-out"
            style={{ width: `${donePct}%`, backgroundColor: doneColor }}
          />
          {test > 0 && (
            <div
              className="absolute inset-y-0 transition-[width,left] duration-500 ease-out"
              style={{ left: `${donePct}%`, width: `${testPct}%`, backgroundColor: testColor, opacity: 0.7 }}
            />
          )}
          {prog > 0 && (
            <div
              className="absolute inset-y-0 transition-[width,left] duration-500 ease-out"
              style={{ left: `${donePct + testPct}%`, width: `${progPct}%`, backgroundColor: progColor, opacity: 0.5 }}
            />
          )}
        </div>
        {/* Counts positioned under their segments */}
        <div className="absolute left-0 right-0 text-[9px] tabular-nums text-text-muted leading-none" style={{ top: LABEL_TOP }}>
          {done > 0 && (
            <span className="absolute flex items-center gap-0.5" style={{ left: `${donePct / 2}%`, transform: "translateX(-50%)" }}>
              <span className="h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: doneColor }} />
              <span>{done}{gridLayout && " done"}</span>
            </span>
          )}
          {test > 0 && (
            <span className="absolute flex items-center gap-0.5" style={{ left: `${donePct + testPct / 2}%`, transform: "translateX(-50%)" }}>
              <span className="h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: testColor, opacity: 0.7 }} />
              <span>{test}{gridLayout && " test"}</span>
            </span>
          )}
          {prog > 0 && (
            <span className="absolute flex items-center gap-0.5" style={{ left: `${donePct + testPct + progPct / 2}%`, transform: "translateX(-50%)" }}>
              <span className="h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: progColor, opacity: 0.5 }} />
              <span>{prog}{gridLayout && " prog"}</span>
            </span>
          )}
        </div>
      </div>

      {/* Percentage */}
      <span className={`text-[10px] font-medium tabular-nums text-text-tertiary${gridLayout ? " text-right" : ""}`}>{completePct}%</span>

      {/* Time bar + label, hidden on narrow screens */}
      {hasTime && !hideTime && (
        <div className="relative self-stretch pl-2 border-l border-border-subtle hidden lg:block" style={{ width: TIME_W }}>
          <div className="absolute left-[9px] right-0 h-[5px] overflow-hidden rounded-full" style={{ top: BAR_TOP, backgroundColor: "var(--color-overlay-default)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${timePct}%`,
                backgroundColor: workingDaysRemaining! <= 2 ? "color-mix(in srgb, var(--color-status-caution) 55%, transparent)" : "var(--color-text-muted)",
                opacity: 0.4,
              }}
            />
          </div>
          <span className={`absolute text-[10px] tabular-nums whitespace-nowrap leading-none ${workingDaysRemaining! <= 2 ? "text-amber-400/70" : "text-text-muted"}`} style={{ top: LABEL_TOP, left: 9 }}>
            {workingDaysRemaining === 0 ? "ended" : workingDaysRemaining === 1 ? "last day" : `day ${daysElapsed}/${totalWorkingDays}`}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────
// Colored chip for Jira statuses. Shows a dot when showDot is true.
// Pass onClick to make it a filter toggle (active = currently selected).

interface StatusPillProps extends BaseProps {
  colorKey: string;                    // key into STATUS_PILL_COLORS
  label: string;
  count?: number;                      // when set, renders "label: count" or dot+count
  showDot?: boolean;                   // prepend color dot instead of text label
  active?: boolean;
  dimmed?: boolean;                    // when other filters are active but not this one
  onClick?: (e: React.MouseEvent) => void;
}

export function StatusPill({
  size = "md",
  colorKey,
  label,
  count,
  showDot = false,
  active = false,
  dimmed = false,
  onClick,
  className = "",
}: StatusPillProps) {
  const s = SIZE[size];
  const colors = STATUS_PILL_COLORS[colorKey] ?? STATUS_PILL_COLORS["TO DO"];
  const isInteractive = !!onClick;

  const style: React.CSSProperties = {
    backgroundColor: active ? colors.bgActive : colors.bg,
    color: active ? colors.textActive : colors.text,
    opacity: dimmed ? 0.38 : 1,
  };

  const content = showDot ? (
    <>
      <span
        className={`${s.dot} rounded-full shrink-0`}
        style={{ backgroundColor: active ? colors.textActive : (colors.dot ?? colors.text), opacity: active ? 0.9 : 0.55 }}
      />
      {count != null ? count : label}
    </>
  ) : (
    <>{count != null ? `${label}: ${count}` : label}</>
  );

  const base = [
    "inline-flex items-center font-medium tabular-nums shrink-0 select-none",
    s.radius,
    s.pill,
    s.text,
    s.gap,
  ].join(" ");

  if (!isInteractive) {
    return (
      <span className={`${base} ${className}`} style={style}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} cursor-pointer transition-colors duration-100 hover:opacity-80 active:opacity-60 ${className}`}
      style={style}
    >
      {content}
    </button>
  );
}
