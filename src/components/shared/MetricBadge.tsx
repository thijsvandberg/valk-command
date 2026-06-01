"use client";

// Reusable SP / BV display badge (BRDG-240). A leading gauge (SP, effort) or
// goal (BV, value) icon plus the number, with the project color rules:
//   - SP has no value color by default (neutral grey); only the `tinted`
//     emphasis variant uses the green effort ramp.
//   - BV always uses its band: neutral grey at 1-2, amber → orange at 3-7.
// This is display-only; the editable trigger lives in StoryPointPicker /
// BusinessValuePicker (which share the same icon + color treatment).

import { Gauge, Goal } from "lucide-react";
import { getSpColor, getBvColor } from "@/types/ticket";
import { Tooltip } from "@/components/shared/Tooltip";

export type MetricKind = "sp" | "bv";

const LABELS: Record<MetricKind, string> = { sp: "Story Points", bv: "Business Value" };

export function MetricBadge({
  metric,
  value,
  tinted = false,
  tooltip = true,
  size = "sm",
  className = "",
}: {
  metric: MetricKind;
  value: number | null;
  // Colored background + (for SP) the green ramp. Untinted = transparent, SP neutral grey.
  tinted?: boolean;
  // Use the styled Tooltip (default). Set false to fall back to the native title attribute.
  tooltip?: boolean;
  size?: "xs" | "sm";
  className?: string;
}) {
  const Icon = metric === "sp" ? Gauge : Goal;
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

  const badge = (
    <span
      className={`inline-flex items-center rounded-md font-medium tabular-nums ${sz.wrap} ${className}`}
      style={{ color: fg, backgroundColor: bg }}
      aria-label={title}
      title={tooltip ? undefined : title}
    >
      <Icon size={sz.icon} strokeWidth={2} aria-hidden />
      {display}
    </span>
  );

  return tooltip ? <Tooltip content={title}>{badge}</Tooltip> : badge;
}
