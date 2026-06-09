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

export function FullnessMeter({
  used,
  capacity,
  onCapacityChange,
}: {
  used: number;
  capacity: number | null;
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
  const fillPct = ratio != null ? Math.min(ratio, 1) * 100 : 0;

  const tooltip = capacity != null
    ? `Sprint fullness: ${used} of ${capacity} pts (${Math.round((ratio ?? 0) * 100)}%)${over ? " - over capacity" : ""}`
    : `Used ${used} pts. Set a pencil capacity to track fullness.`;

  // The pill is always neutral; the slim bar carries the only colour - teal within
  // capacity, red once over it.
  const fillColor = over ? "var(--color-status-error)" : "var(--color-brand-400)";

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
            className="h-[3px] w-14 overflow-hidden rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)" }}
          >
            <span
              data-testid="fullness-bar-fill"
              className="block h-full rounded-full"
              style={{
                transform: `scaleX(${Math.max(fillPct, 2) / 100})`,
                transformOrigin: "left",
                transition: "transform 0.25s ease",
                backgroundColor: fillColor,
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
          className="h-5 min-w-[1.5ch] max-w-[3.5ch] box-border px-1 cursor-text select-text rounded text-center font-medium tabular-nums outline-none transition-colors duration-100 [field-sizing:content] text-[color-mix(in_srgb,currentColor_80%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus:bg-[var(--color-surface-default)] focus:text-text-primary focus:shadow-[0_0_0_2px_var(--color-brand-400)] placeholder:font-normal placeholder:text-text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </Tooltip>
  );
}
