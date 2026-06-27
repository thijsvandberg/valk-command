"use client";

import { useRef, useState } from "react";
import { Tooltip } from "@/components/shared/Tooltip";

// Forward-planning fullness meter (BRDG-303). Shown on a sprint group header when
// planning mode is on. "used" is the sum of effective points (real SP, else
// guestimation); "capacity" is the PO's pencil estimate for the sprint. With a
// capacity set, a bar shows used/capacity; with none, only the used total shows (no
// fill ratio) and the capacity field invites a value. The capacity is always editable:
// clicking anywhere on the meter focuses (and selects) it.
//
// The meter stays visually neutral so a full sprint reads calm, not alarmed: grey text
// on a faint surface, with a teal fill bar. The ONLY over-capacity signal is the bar
// turning red - text, numbers and pill stay neutral - so it is noticeable without
// shouting (the loud full-red band treatment was rejected).
//
// On the epic view the bar is split (BRDG): `ownUsed` is the share of the sprint's
// load that belongs to the open epic. Its segment is brand-coloured (this epic), the
// remainder of the used points is dark grey (the rest of the sprint), and the open
// capacity is the light grey track. Without `ownUsed` (sprint board) the bar is a
// single fill, as before.

export function FullnessMeter({
  used,
  capacity,
  ownUsed,
  onCapacityChange,
}: {
  used: number;
  capacity: number | null;
  /** This epic's share of the sprint's used points. When set (and below `used`), the
   *  bar splits into a brand "this epic" segment and a dark grey "rest of sprint" one. */
  ownUsed?: number | null;
  onCapacityChange: (value: number | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(capacity != null ? String(capacity) : "");
  // Resync the editable draft when the persisted capacity changes externally
  // (another tab, optimistic update). React's "adjust state during render" pattern
  // avoids a setState-in-effect cascade.
  const [prevCapacity, setPrevCapacity] = useState(capacity);
  if (capacity !== prevCapacity) {
    setPrevCapacity(capacity);
    setDraft(capacity != null ? String(capacity) : "");
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (capacity != null) onCapacityChange(null);
      return;
    }
    const next = Number(trimmed);
    if (Number.isFinite(next) && next >= 0 && next <= 999) {
      if (next !== capacity) onCapacityChange(next);
    } else {
      setDraft(capacity != null ? String(capacity) : "");
    }
  }

  const ratio = capacity != null && capacity > 0 ? used / capacity : null;
  const over = ratio != null && ratio > 1;
  const usedPct = ratio != null ? Math.min(ratio, 1) * 100 : 0;

  // This epic's own share. Without it, `own` collapses to `used` so the bar renders as
  // a single fill (the brand segment fully covers the dark grey one). A split shows only
  // when the epic accounts for less than the whole sprint's used points.
  const own = ownUsed ?? used;
  const ownRatio = capacity != null && capacity > 0 ? own / capacity : null;
  // The epic's share is part of the sprint total, so its segment can never be wider
  // than the used span. Capping at usedPct avoids a transient overshoot while the
  // sprint total (a separate server read) catches up to an optimistic child edit.
  const ownPct = ownRatio != null ? Math.min(Math.min(ownRatio, 1) * 100, usedPct) : 0;
  const hasSplit = ownUsed != null && ownUsed < used;

  const tooltip = capacity != null
    ? `Sprint fullness: ${used} of ${capacity} pts (${Math.round((ratio ?? 0) * 100)}%)${over ? " - over capacity" : ""}${hasSplit ? ` · this epic: ${ownUsed} pts` : ""}`
    : `Used ${used} pts. Set a pencil capacity to track fullness.`;

  // The pill is always neutral; the slim bar carries the only colour - teal for this
  // epic's share, dark grey for the rest of the sprint, light grey track for the open
  // capacity. Over capacity, the whole used span turns red (the only over signal).
  const fillColor = over ? "var(--color-status-error)" : "var(--color-brand-400)";
  const restColor = over ? "var(--color-status-error)" : "color-mix(in srgb, currentColor 55%, transparent)";

  return (
    <Tooltip content={tooltip}>
      <div
        className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-body-sm tabular-nums"
        style={{
          color: "var(--color-text-secondary)",
          backgroundColor: "var(--color-overlay-subtle)",
        }}
        onClick={(e) => {
          // The capacity field is a small target, so clicking anywhere on the
          // meter focuses and selects it - making the value easy to (re)edit.
          e.stopPropagation();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        role="group"
        aria-label="Sprint fullness"
      >
        {capacity != null && (
          <span
            aria-hidden
            data-testid="fullness-bar-track"
            className="relative h-[3px] w-14 overflow-hidden rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)" }}
          >
            {/* The full used span (this epic + the rest of the sprint). Dark grey within
                capacity, red once over it. Sits underneath the brand "own" segment. */}
            <span
              data-testid="fullness-bar-rest"
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${used > 0 ? Math.max(usedPct, 2) : 0}%`,
                backgroundColor: restColor,
                transition: "width 0.25s ease, background-color 0.25s ease",
              }}
            />
            {/* This epic's own share, layered on the left as the leading segment. When no
                split is active it spans the whole used run, so the bar reads as one fill. */}
            <span
              data-testid="fullness-bar-fill"
              className={`absolute inset-y-0 left-0 ${hasSplit ? "rounded-l-full" : "rounded-full"}`}
              style={{
                width: `${own > 0 ? Math.max(ownPct, 2) : 0}%`,
                backgroundColor: fillColor,
                transition: "width 0.25s ease, background-color 0.25s ease",
              }}
            />
          </span>
        )}
        <span className="font-medium">{used}</span>
        <span style={{ color: "color-mix(in srgb, currentColor 45%, transparent)" }}>/</span>
        <input
          ref={inputRef}
          type="number"
          min={0}
          max={999}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { e.preventDefault(); setDraft(capacity != null ? String(capacity) : ""); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder="–"
          aria-label="Sprint pencil capacity"
          title="Edit sprint capacity"
          // At rest the capacity looks like plain muted text so a set sprint reads as
          // calm as the rest of the pill. Hover reveals a faint chip; focus turns it
          // into an unmistakable little field - solid surface, full-strength text and a
          // brand ring. field-sizing:content makes the field hug its value so the
          // hover/focus chip wraps the number tightly (min/max-w bound the non-Chrome
          // fallback) instead of floating in a fixed-width box.
          className="h-5 min-w-[1.5ch] max-w-[3.5ch] box-border px-1 cursor-text select-text rounded text-center font-medium tabular-nums outline-none transition-colors duration-100 [field-sizing:content] text-[color-mix(in_srgb,currentColor_80%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus:bg-surface-base focus:text-text-primary focus:shadow-[0_0_0_2px_var(--color-brand-400)] placeholder:font-normal placeholder:text-text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </Tooltip>
  );
}
