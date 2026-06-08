"use client";

import { useRef, useState } from "react";
import { Ruler } from "lucide-react";
import { fullnessBand, FULLNESS_BAND_COLORS } from "@/types/ticket";
import { Tooltip } from "@/components/shared/Tooltip";

// Forward-planning fullness meter (BRDG-303). Shown on a sprint group header when
// planning mode is on. "used" is the sum of effective points (real SP, else
// guestimation); "capacity" is the PO's pencil estimate for the sprint. With a
// capacity set, a band-coloured bar shows used/capacity; with none, only the used
// total shows (no fill ratio) and the capacity field invites a value. The capacity
// is always editable: clicking anywhere on the meter focuses (and selects) it.

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
  const band = ratio != null ? fullnessBand(ratio) : null;
  const c = band ? FULLNESS_BAND_COLORS[band] : null;
  const fillPct = ratio != null ? Math.min(ratio, 1) * 100 : 0;

  const tooltip = capacity != null
    ? `Sprint fullness: ${used} of ${capacity} pts (${Math.round((ratio ?? 0) * 100)}%)`
    : `Used ${used} pts. Set a pencil capacity to track fullness.`;

  // Subtle, cohesive with the neighbouring SP/BV pills: a faint band tint (no
  // border), the band colour carried by a slim transform-scaled bar and the used
  // value, with the capacity denominator kept quiet. No filled chunky bar / bold
  // numerals (BRDG-303).
  const accent = c?.text ?? "var(--color-text-secondary)";
  const fillColor = c?.fill ?? "var(--color-text-muted)";

  return (
    <Tooltip content={tooltip}>
      <div
        className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-body-sm tabular-nums"
        style={{
          color: accent,
          backgroundColor: c
            ? `color-mix(in srgb, ${c.text} 7%, transparent)`
            : "var(--color-overlay-subtle)",
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
        <Ruler size={11} strokeWidth={2} aria-hidden style={{ color: "color-mix(in srgb, currentColor 55%, transparent)" }} />
        {capacity != null && (
          <span
            aria-hidden
            className="h-[3px] w-14 overflow-hidden rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)" }}
          >
            <span
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
          placeholder="cap"
          aria-label="Sprint pencil capacity"
          title="Edit sprint capacity"
          // A faint hover/focus chip signals the value is editable (it otherwise
          // reads as static text once filled) and widens the click target.
          className="h-5 w-8 cursor-text select-text rounded bg-transparent text-center font-medium tabular-nums outline-none transition-colors duration-100 placeholder:font-normal placeholder:text-text-muted hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus:bg-[color-mix(in_srgb,currentColor_16%,transparent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ color: "color-mix(in srgb, currentColor 78%, transparent)" }}
        />
      </div>
    </Tooltip>
  );
}
