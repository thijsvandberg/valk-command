"use client";

/**
 * Throwaway exploration: sprint capacity meter (FullnessMeter) restyle.
 *
 * Colour direction is settled (variant A): neutral pill, teal fill bar, no icon, and
 * the bar turns red when over capacity. This page now refines the EDITABLE capacity
 * field, which still felt off in the real component:
 *   - dead space on the right (the input was a fixed w-9, centred)
 *   - the "cap" placeholder read awkwardly as a denominator
 *   - the hover / edit state felt too boxy
 *
 * The meters below are interactive (click the denominator and type). Three edit
 * treatments are compared so the right one can be picked before touching the real
 * component.
 *
 * Reachable at /dev/exploration/capacity-meter. Not linked from app nav.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Zap, Gauge, Goal } from "lucide-react";

const NEUTRAL_TEXT = "var(--color-text-secondary)";
const NEUTRAL_PILL = "var(--color-overlay-subtle)";
const BRAND = "var(--color-brand-400)";
const ERROR = "var(--color-status-error)";

function tint(color: string, pct: number) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

// ---- Edit-affordance treatments for the capacity denominator -------------------------

type Treatment = "quiet" | "underline" | "dashed";

// field-sizing:content lets the input hug its value so the hover/focus chip wraps the
// number tightly instead of floating in a fixed-width box; min-w keeps the empty-state
// dash tappable.
const INPUT_BASE =
  "h-5 min-w-[1.5ch] box-border px-1 cursor-text select-text rounded text-center font-medium tabular-nums outline-none transition-colors duration-100 [field-sizing:content] placeholder:font-normal placeholder:text-text-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const INPUT_BY_TREATMENT: Record<Treatment, string> = {
  // Quiet: at rest it looks like plain muted text (no border, no underline). Hover
  // reveals a faint chip; focus gives a clear surface + brand ring.
  quiet:
    "text-[color-mix(in_srgb,currentColor_80%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus:bg-[var(--color-surface-default)] focus:text-text-primary focus:shadow-[0_0_0_2px_var(--color-brand-400)]",
  // Underline: refined version of the shipped one - a lighter dotted underline hints
  // editability at rest, cleared on focus.
  underline:
    "underline decoration-dotted decoration-[color-mix(in_srgb,currentColor_30%,transparent)] underline-offset-[3px] text-[color-mix(in_srgb,currentColor_80%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus:no-underline focus:bg-[var(--color-surface-default)] focus:text-text-primary focus:shadow-[0_0_0_2px_var(--color-brand-400)] placeholder:no-underline",
  // Dashed chip: a dashed outline reads as a "pencil" estimate (the capacity is the
  // PO's pencil number); solidifies on focus.
  dashed:
    "border border-dashed border-[color-mix(in_srgb,currentColor_30%,transparent)] text-[color-mix(in_srgb,currentColor_80%,transparent)] hover:bg-[color-mix(in_srgb,currentColor_8%,transparent)] focus:border-transparent focus:bg-[var(--color-surface-default)] focus:text-text-primary focus:shadow-[0_0_0_2px_var(--color-brand-400)]",
};

// ---- Interactive meter ---------------------------------------------------------------

function EditableMeter({
  used,
  initialCap,
  treatment,
}: {
  used: number;
  initialCap: number | null;
  treatment: Treatment;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [capacity, setCapacity] = useState<number | null>(initialCap);
  const [draft, setDraft] = useState(initialCap != null ? String(initialCap) : "");

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      setCapacity(null);
      return;
    }
    const next = Number(trimmed);
    if (Number.isFinite(next) && next >= 0 && next <= 999) setCapacity(next);
    else setDraft(capacity != null ? String(capacity) : "");
  }

  const ratio = capacity != null && capacity > 0 ? used / capacity : null;
  const over = ratio != null && ratio > 1;
  const fillPct = ratio != null ? Math.min(ratio, 1) * 100 : 0;
  const fillColor = over ? ERROR : BRAND;

  return (
    <div
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-body-sm tabular-nums"
      style={{ color: NEUTRAL_TEXT, backgroundColor: NEUTRAL_PILL }}
      onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.focus();
        inputRef.current?.select();
      }}
    >
      {capacity != null && (
        <span
          aria-hidden
          className="h-[3px] w-14 overflow-hidden rounded-full"
          style={{ backgroundColor: tint("currentColor", 16) }}
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
      <span style={{ color: tint("currentColor", 45) }}>/</span>
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
        className={`${INPUT_BASE} ${INPUT_BY_TREATMENT[treatment]}`}
      />
    </div>
  );
}

// ---- Faithful sprint-header clone ----------------------------------------------------

function MiniPill({ icon: Icon, value, color }: { icon: typeof Gauge; value: number; color: string }) {
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-body-sm font-medium tabular-nums"
      style={{ color, backgroundColor: tint(color, 9) }}
    >
      <Icon size={12} strokeWidth={2} aria-hidden />
      {value}
    </span>
  );
}

function HeaderRow({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-default)] px-3 py-2.5 ring-1 ring-border-default">
      <Zap size={15} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" aria-hidden />
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-status-done)]" aria-hidden />
      <span className="shrink-0 font-semibold text-text-secondary">BT: 139</span>
      <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-overlay-default px-2 text-body-sm text-text-tertiary">
        4 items
      </span>
      <MiniPill icon={Gauge} value={6} color="var(--color-status-done)" />
      <MiniPill icon={Goal} value={9} color="var(--color-brand-300)" />
      {children}
      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{note}</span>
    </div>
  );
}

const TREATMENTS: { id: Treatment; title: string; blurb: string; recommended?: boolean }[] = [
  {
    id: "quiet",
    title: "1 - Quiet text (chip on hover)",
    blurb:
      "At rest the capacity is plain muted text - no underline, no box - so a set sprint reads as clean as the rest of the pill. Hover reveals a faint chip; focus gives a solid field + brand ring. Calmest.",
    recommended: true,
  },
  {
    id: "underline",
    title: "2 - Dotted underline (refined)",
    blurb:
      "A lighter version of the shipped treatment: a faint dotted underline hints the value is editable even before you hover, cleared on focus.",
  },
  {
    id: "dashed",
    title: "3 - Dashed pencil chip",
    blurb:
      "The capacity sits in a dashed outline at rest - reads as a 'pencil' estimate (which is exactly what it is). Solidifies into a real field on focus.",
  },
];

export default function CapacityMeterExplorationPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[920px]">
        <Link
          href="/dev/exploration"
          className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          All explorations
        </Link>

        <header className="mb-10">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/capacity-meter
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Capacity meter - editable field
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Colour is settled (neutral pill, teal bar, red bar when over). These refine the editable
            capacity: the input is tightened (no more dead space on the right), the awkward &ldquo;cap&rdquo;
            placeholder becomes a quiet dash, and the hover / edit state is lightened. The meters are
            live - click a denominator and type. Each treatment is shown set (25 / 30) and unset.
          </p>
        </header>

        <div className="flex flex-col gap-10">
          {TREATMENTS.map((t) => (
            <section key={t.id}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{t.title}</h2>
                {t.recommended && (
                  <span className="rounded-full bg-[var(--color-brand-400)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-300)]">
                    Suggested
                  </span>
                )}
              </div>
              <p className="mb-4 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">{t.blurb}</p>
              <div className="flex flex-col gap-2">
                <HeaderRow note="Set (25 / 30)">
                  <EditableMeter used={25} initialCap={30} treatment={t.id} />
                </HeaderRow>
                <HeaderRow note="Over (34 / 20)">
                  <EditableMeter used={34} initialCap={20} treatment={t.id} />
                </HeaderRow>
                <HeaderRow note="Unset (no capacity)">
                  <EditableMeter used={27} initialCap={null} treatment={t.id} />
                </HeaderRow>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
