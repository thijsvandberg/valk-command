"use client";

// Shared pill component for sprint board stat/status chips.
// Used in both the header bar (size="md") and grouped sprint headers (size="sm").
// Two variants:
//   stat   - neutral info chip (items, pts, no pts); non-interactive or interactive
//   status - colored chip with optional dot indicator (IN PROGRESS, DONE, TO DO, TEST)

export type PillSize = "md" | "sm";
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
    bg: "rgba(100, 116, 139, 0.12)",
    bgActive: "rgba(100, 116, 139, 0.20)",
    text: "#94a3b8",
    textActive: "#b8c8d8",
    ring: "rgba(100, 116, 139, 0.35)",
  },
  "IN PROGRESS": {
    bg: "rgba(56, 152, 210, 0.10)",
    bgActive: "rgba(56, 152, 210, 0.20)",
    text: "#58b4e6",
    textActive: "#7ec8f0",
    ring: "rgba(56, 152, 210, 0.35)",
    dot: "#58b4e6",
  },
  TEST: {
    bg: "rgba(120, 90, 220, 0.12)",
    bgActive: "rgba(120, 90, 220, 0.22)",
    text: "#9b7ee8",
    textActive: "#b49cf0",
    ring: "rgba(120, 90, 220, 0.35)",
    dot: "#9b7ee8",
  },
  DONE: {
    bg: "rgba(34, 197, 94, 0.10)",
    bgActive: "rgba(34, 197, 94, 0.20)",
    text: "#4ade80",
    textActive: "#6aee96",
    ring: "rgba(34, 197, 94, 0.35)",
    dot: "#4ade80",
  },
};

// Size tokens: md for header bar, sm for group headers
const SIZE = {
  md: {
    pill: "px-2 py-0.5",
    text: "text-xs",       // 12px — header bar has more room
    dot: "h-1.5 w-1.5",
    gap: "gap-1.5",
  },
  sm: {
    pill: "px-1.5 py-0.5",
    text: "text-[10px]",   // matches --text-caption (10px)
    dot: "h-1.5 w-1.5",
    gap: "gap-1",
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
    bg: "rgba(234,179,8,0.06)",
    text: "rgba(210,155,20,0.55)",
    activeBg: "rgba(234,179,8,0.13)",
    activeText: "rgba(234,179,8,0.80)",
    activeRing: "rgba(234,179,8,0.25)",
  },
};

interface StatPillProps extends BaseProps {
  children: React.ReactNode;
  variant?: StatPillVariant;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export function StatPill({ size = "md", variant = "default", active, onClick, className = "", children }: StatPillProps) {
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
      <span className={`${base} ${className}`} style={style}>
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
    >
      {children}
    </span>
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
    ...(active ? { boxShadow: `0 0 0 1px ${colors.ring}` } : {}),
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
    "inline-flex items-center rounded font-medium tabular-nums shrink-0 select-none",
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
