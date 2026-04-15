"use client";

import { useRef, useState } from "react";
import { Activity } from "lucide-react";
import type { ActivityLogTimelineEntry } from "@/types/ticket";
import { entryTypeLabel, formatTimestamp, formatDuration } from "./activity-helpers";

export function EventTimeline({
  entries,
  onClickEntry,
}: {
  entries: ActivityLogTimelineEntry[];
  onClickEntry: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    entry: ActivityLogTimelineEntry;
  } | null>(null);

  const now = +new Date();
  const windowStart = now - 24 * 60 * 60 * 1000;

  const dotColor = (status: ActivityLogTimelineEntry["status"]) => {
    if (status === "success") return "#3389d8"; // brand-400
    if (status === "failed") return "#f87171"; // red-400
    return "#fbbf24"; // amber-400 for running/cancelled
  };

  const hourLabels = Array.from({ length: 7 }, (_, i) => {
    const ts = windowStart + (i * 4 * 60 * 60 * 1000);
    const pct = ((ts - windowStart) / (now - windowStart)) * 100;
    if (pct < 0 || pct > 100) return null;
    const h = new Date(ts).getHours();
    return { label: `${h.toString().padStart(2, "0")}:00`, pct };
  }).filter(Boolean) as { label: string; pct: number }[];

  return (
    <div className="mb-5 rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-3.5 w-3.5 text-white/20" strokeWidth={1.5} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/20 font-[var(--font-body)]">
          Last 24 Hours
        </span>
        <span className="ml-auto text-[10px] text-white/15 font-[var(--font-body)]">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </span>
      </div>

      {/* Timeline track */}
      <div
        ref={containerRef}
        className="relative h-6 rounded-full bg-white/[0.03] border border-white/[0.04] overflow-visible"
        style={{ marginBottom: "20px" }}
      >
        {/* Track fill */}
        <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.015))" }} />

        {/* Dots */}
        {entries.map((entry) => {
          const pct =
            ((new Date(entry.startedAt).getTime() - windowStart) / (now - windowStart)) * 100;
          if (pct < 0 || pct > 100) return null;
          const color = dotColor(entry.status);
          return (
            <button
              key={entry.id}
              type="button"
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 4px ${color}60`,
                cursor: "pointer",
                border: "none",
                padding: 0,
                outline: "none",
                zIndex: 1,
                transition: "transform 0.1s ease, box-shadow 0.1s ease",
              }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({ x: rect.left + rect.width / 2, y: rect.top, entry });
                (e.currentTarget as HTMLButtonElement).style.transform = "translate(-50%, -50%) scale(1.6)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 8px ${color}90`;
              }}
              onMouseLeave={(e) => {
                setTooltip(null);
                (e.currentTarget as HTMLButtonElement).style.transform = "translate(-50%, -50%)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 4px ${color}60`;
              }}
              onClick={() => onClickEntry(entry.id)}
              aria-label={`${entryTypeLabel(entry.type)} at ${formatTimestamp(entry.startedAt)}`}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            />
          );
        })}

        {/* Now indicator */}
        <div
          className="absolute top-0 bottom-0 right-0 w-px bg-white/[0.08]"
          style={{ borderRight: "1px dashed rgba(255,255,255,0.08)" }}
        />
      </div>

      {/* Hour labels */}
      <div className="relative h-4" style={{ marginTop: "-16px" }}>
        {hourLabels.map(({ label, pct }) => (
          <span
            key={label}
            className="absolute text-[9px] text-white/15 font-[var(--font-body)] -translate-x-1/2"
            style={{ left: `${pct}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-[100] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
          style={{
            top: tooltip.y - 8,
            left: tooltip.x,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="text-[11px] font-semibold text-white/80 font-[var(--font-body)]">
            {entryTypeLabel(tooltip.entry.type)}
          </div>
          <div className="text-[10px] text-white/40 font-[var(--font-body)] mt-0.5 space-y-0.5">
            <div>{formatTimestamp(tooltip.entry.startedAt)}</div>
            {tooltip.entry.scope && <div>{tooltip.entry.scope}</div>}
            {tooltip.entry.durationMs && <div>{formatDuration(tooltip.entry.durationMs)}</div>}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-white/15 font-[var(--font-body)]">No events in the last 24 hours</span>
        </div>
      )}
    </div>
  );
}
