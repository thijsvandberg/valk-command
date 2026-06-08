"use client";

import { useState } from "react";
import { Ruler } from "lucide-react";
import { fullnessBand, FULLNESS_BAND_COLORS } from "@/types/ticket";
import { Tooltip } from "@/components/shared/Tooltip";

// Forward-planning fullness meter (BRDG-303). Shown on a sprint group header when
// planning mode is on. "used" is the sum of effective points (real SP, else
// guestimation); "capacity" is the PO's pencil estimate for the sprint. With a
// capacity set, a band-coloured bar shows used/capacity; with none, only the used
// total shows (no fill ratio) and the capacity field invites a value. The whole
// cluster wears a dashed outline to read as provisional, like the guess badge.

export function FullnessMeter({
  used,
  capacity,
  onCapacityChange,
}: {
  used: number;
  capacity: number | null;
  onCapacityChange: (value: number | null) => void;
}) {
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
  const band = ratio != null ? fullnessBand(ratio) : null;
  const c = band ? FULLNESS_BAND_COLORS[band] : null;
  const fillPct = ratio != null ? Math.min(ratio, 1) * 100 : 0;

  const tooltip = capacity != null
    ? `Sprint fullness: ${used} of ${capacity} pts (${Math.round((ratio ?? 0) * 100)}%)`
    : `Used ${used} pts. Set a pencil capacity to track fullness.`;

  return (
    <Tooltip content={tooltip}>
      <div
        className="flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-dashed px-1.5 text-[11px] leading-none tabular-nums"
        style={{
          color: c?.text ?? "var(--color-text-secondary)",
          backgroundColor: c?.bg ?? "var(--color-overlay-subtle)",
          borderColor: c
            ? `color-mix(in srgb, ${c.text} 40%, transparent)`
            : "var(--color-border-default)",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Ruler size={11} strokeWidth={2} aria-hidden className="opacity-70" />
        {capacity != null && (
          <span
            aria-hidden
            className="h-1.5 w-12 overflow-hidden rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, currentColor 18%, transparent)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${fillPct}%`, backgroundColor: c?.fill ?? "currentColor" }}
            />
          </span>
        )}
        <span className="font-semibold">{used}</span>
        <span className="opacity-60">/</span>
        <input
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
          placeholder="cap"
          aria-label="Sprint pencil capacity"
          className="w-9 bg-transparent text-center font-semibold tabular-nums outline-none placeholder:font-normal placeholder:not-italic placeholder:text-text-muted focus:underline focus:decoration-dashed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ color: "inherit" }}
        />
      </div>
    </Tooltip>
  );
}
