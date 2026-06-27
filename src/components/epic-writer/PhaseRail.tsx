"use client";

import {
  EPIC_WRITER_PHASES,
  EPIC_WRITER_PHASE_LABELS,
  type EpicWriterPhase,
} from "@/types/epic-writer";

interface PhaseRailProps {
  current: EpicWriterPhase;
  onSelect: (phase: EpicWriterPhase) => void;
}

/**
 * Horizontal rail of the six Epic Writer phases. Movement is free: any phase
 * is selectable from any phase. In BRDG-292 this is a persisted bookmark only;
 * it does not gate behavior. Later stories attach phase-specific affordances.
 */
export function PhaseRail({ current, onSelect }: PhaseRailProps) {
  return (
    <nav
      aria-label="Epic phases"
      className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-surface-base/40 px-4 py-2"
    >
      {EPIC_WRITER_PHASES.map((phase, idx) => {
        const active = phase === current;
        return (
          <button
            key={phase}
            type="button"
            aria-current={active ? "step" : undefined}
            onClick={() => onSelect(phase)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              active
                ? "bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-400)]"
                : "text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
            }`}
          >
            <span className="font-mono text-caption tabular-nums opacity-70">{idx + 1}</span>
            <span>{EPIC_WRITER_PHASE_LABELS[phase]}</span>
          </button>
        );
      })}
    </nav>
  );
}
