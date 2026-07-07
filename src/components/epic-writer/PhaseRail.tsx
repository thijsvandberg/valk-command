"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ListOrdered, Check } from "lucide-react";
import {
  EPIC_WRITER_PHASES,
  EPIC_WRITER_PHASE_LABELS,
  type EpicWriterPhase,
} from "@/types/epic-writer";
import { MenuItem, MenuList } from "@/components/shared/MenuItem";
import { useOutsideClick } from "@/hooks/useOutsideClick";

interface PhaseRailProps {
  current: EpicWriterPhase;
  onSelect: (phase: EpicWriterPhase) => void;
}

/**
 * Compact phase control folded into the header (BRDG-490 #4, BRDG-491 #2). Rather
 * than laying all five steps out inline (which does not scale on a narrow header),
 * it shows the current step with prev / next icon buttons and a small "all steps"
 * button that opens a popover to jump directly. Movement is free (BRDG-488): any
 * phase is reachable from any phase; it bookmarks the session and steers the
 * right-hand view (BRDG-484).
 */
export function PhaseRail({ current, onSelect }: PhaseRailProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const idx = Math.max(0, EPIC_WRITER_PHASES.indexOf(current));
  const isFirst = idx === 0;
  const isLast = idx === EPIC_WRITER_PHASES.length - 1;
  const step = (i: number) => {
    const phase = EPIC_WRITER_PHASES[i];
    if (phase) onSelect(phase);
  };

  const stepButton =
    "flex size-6 shrink-0 items-center justify-center rounded-md text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    // Bounded container (BRDG-500 #6): a subtle bordered capsule gives the phase
    // control a deliberate identity of its own instead of bare icon buttons
    // floating in the header row.
    <nav
      ref={ref}
      aria-label="Epic phases"
      className="relative flex shrink-0 items-center gap-0.5 rounded-lg border border-border-subtle bg-surface-elevated/70 px-1 py-0.5"
    >
      <button
        type="button"
        onClick={() => step(idx - 1)}
        disabled={isFirst}
        aria-label="Previous phase"
        title="Previous step"
        className={stepButton}
      >
        <ChevronLeft size={14} strokeWidth={2} />
      </button>

      <span
        aria-current="step"
        className="flex items-center gap-1.5 whitespace-nowrap px-1 text-body-sm font-medium text-[var(--color-brand-400)]"
      >
        <span className="font-mono text-caption tabular-nums opacity-70">{idx + 1}</span>
        {EPIC_WRITER_PHASE_LABELS[current]}
      </span>

      <button
        type="button"
        onClick={() => step(idx + 1)}
        disabled={isLast}
        aria-label="Next phase"
        title="Next step"
        className={stepButton}
      >
        <ChevronRight size={14} strokeWidth={2} />
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="All phases"
        title="All steps"
        className={stepButton}
      >
        <ListOrdered size={13} strokeWidth={1.75} />
      </button>

      {open && (
        <MenuList className="absolute left-0 top-full z-30 mt-1.5 w-44" aria-label="Phases">
          {EPIC_WRITER_PHASES.map((phase, i) => {
            const active = phase === current;
            return (
              <MenuItem
                key={phase}
                icon={<span className="font-mono text-caption tabular-nums">{i + 1}</span>}
                active={active}
                onClick={() => {
                  onSelect(phase);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate text-left">{EPIC_WRITER_PHASE_LABELS[phase]}</span>
                {active && <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />}
              </MenuItem>
            );
          })}
        </MenuList>
      )}
    </nav>
  );
}
