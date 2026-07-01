"use client";

// Reusable SP / BV display badge (BRDG-240, re-hued in BRDG-321). A leading hash
// (SP, effort) or trending-up (BV, value) icon plus the number. SP and BV are one
// cohesive marker family — flat single tones (slate / violet), no value ramp:
//   - SP stays neutral by default (untinted); the `tinted` emphasis variant fills
//     with the slate tone.
//   - BV always wears its flat violet tone.
// This is display-only; the editable trigger lives in StoryPointPicker /
// BusinessValuePicker (which share the same icon + color treatment).

import type { ReactNode, KeyboardEvent, MouseEvent } from "react";
import { Hash, TrendingUp, ChevronUp, ChevronDown } from "lucide-react";
import { getSpColor, getBvColor } from "@/types/ticket";
import { Tooltip } from "@/components/shared/Tooltip";

export type MetricKind = "sp" | "bv";

const LABELS: Record<MetricKind, string> = { sp: "Story Points", bv: "Business Value" };

export function MetricBadge({
  metric,
  value,
  tinted = false,
  tooltip = true,
  tooltipContent,
  size = "sm",
  className = "",
  onClick,
  onDoubleClick,
  activeSortDir,
  dimmed = false,
  penciled = false,
}: {
  metric: MetricKind;
  value: number | null;
  // Colored background + (for SP) the green ramp. Untinted = transparent, SP neutral grey.
  tinted?: boolean;
  // Use the styled Tooltip (default). Set false to fall back to the native title attribute.
  tooltip?: boolean;
  // Overrides the default tooltip text (e.g. to append a group average). aria-label stays the plain title.
  tooltipContent?: ReactNode;
  size?: "xs" | "sm";
  className?: string;
  // When provided, the badge becomes an interactive button (cursor, hover, focus, keyboard).
  // Single activation fires onClick; a mouse double-click fires onDoubleClick.
  onClick?: (e: MouseEvent | KeyboardEvent) => void;
  onDoubleClick?: (e: MouseEvent) => void;
  // When set, this metric currently drives the board sort; shows a direction caret + ring.
  activeSortDir?: "asc" | "desc";
  // When the per-row column for this metric is hidden, the header chip reads as "off the rows".
  dimmed?: boolean;
  // "Penciled-in" dashed outline with no fill (BRDG-454): a projected total that folds in
  // guestimates, set apart from the solid committed-SP badge without changing its tone.
  penciled?: boolean;
}) {
  const Icon = metric === "sp" ? Hash : TrendingUp;
  const palette = value != null ? (metric === "sp" ? getSpColor(value) : getBvColor(value)) : null;
  const fg =
    value == null
      ? "var(--color-text-muted)"
      : metric === "sp" && !tinted
        ? "var(--color-text-secondary)"
        : palette!.text;
  const bg = tinted && palette ? palette.bg : "transparent";
  const display = value == null ? "–" : value === 0 ? "-" : value;
  const title = value == null ? `Set ${LABELS[metric]}` : value === 0 ? "N/A" : `${LABELS[metric]}: ${value}`;
  const sz = size === "xs"
    ? { wrap: "gap-0.5 px-1.5 py-0.5 text-caption", icon: 10 }
    : { wrap: "gap-1 px-1.5 py-0.5 text-body-sm", icon: 12 };

  const interactive = !!onClick;
  const Caret = activeSortDir === "asc" ? ChevronUp : ChevronDown;
  // A transparent border is always present so toggling the dashed "hidden" outline
  // never shifts the chip (and its neighbours) by a pixel.
  const interactiveCls = interactive
    ? "cursor-pointer border border-transparent transition-[box-shadow,opacity] duration-150 hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-brand-400)_35%,transparent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-brand-400)]"
    : "";
  const activeCls = activeSortDir ? "shadow-[0_0_0_1.5px_var(--color-brand-400)]" : "";
  const dimmedCls = dimmed ? "border-dashed border-border-strong opacity-55" : "";
  const penciledCls = penciled ? "border border-dashed" : "";

  const badge = (
    <span
      className={`inline-flex items-center rounded-md font-medium tabular-nums ${sz.wrap} ${interactiveCls} ${activeCls} ${dimmedCls} ${penciledCls} ${className}`}
      style={{
        color: fg,
        backgroundColor: penciled || dimmed ? "transparent" : bg,
        ...(penciled ? { borderColor: `color-mix(in srgb, ${fg} 55%, transparent)` } : {}),
      }}
      aria-label={title}
      title={tooltip ? undefined : title}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onDoubleClick,
            "aria-pressed": activeSortDir ? true : undefined,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.(e);
              }
            },
          }
        : {})}
    >
      <Icon size={sz.icon} strokeWidth={2} aria-hidden />
      {display}
      {activeSortDir && <Caret size={sz.icon} strokeWidth={2.5} aria-hidden />}
    </span>
  );

  return tooltip ? <Tooltip content={tooltipContent ?? title}>{badge}</Tooltip> : badge;
}
