"use client";

import {
  EPIC_WRITER_PHASES,
  EPIC_WRITER_PHASE_LABELS,
  type EpicWriterPhase,
} from "@/types/epic-writer";
import { CONTENT_MAX } from "@/lib/layout";

interface PhaseRailProps {
  current: EpicWriterPhase;
  onSelect: (phase: EpicWriterPhase) => void;
}

/**
 * Horizontal rail of the five Epic Writer phases (BRDG-488). Movement is free:
 * any phase is selectable from any phase. It bookmarks the session and steers
 * the right-hand view (BRDG-484); Refine is the full body + AC step.
 */
export function PhaseRail({ current, onSelect }: PhaseRailProps) {
  return (
    // Match the header's content inset (px-8 + CONTENT_MAX, BRDG-487 #4) so the rail
    // aligns under the bridge_ wordmark and reads as page chrome, not part of the
    // chat column. The inner -ml-2.5 cancels the first button's own padding so its
    // label sits directly beneath the wordmark, mirroring the header's -ml on the
    // wordmark trigger.
    <nav
      aria-label="Epic phases"
      className="flex shrink-0 items-center border-b border-border-subtle bg-surface-base/40 px-8 py-2"
    >
      <div className={`${CONTENT_MAX} flex items-center`}>
        <div className="-ml-2.5 flex items-center gap-1">
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
        </div>
      </div>
    </nav>
  );
}
