"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ArrowUpRight, NotebookPen } from "lucide-react";
import type { EpicProgressItem } from "@/app/api/epics/progress/route";
import { useEpicColor } from "@/hooks/useEpicColor";
import { EpicProgressBar } from "./EpicProgressBar";
import { EpicTimeline } from "./EpicTimeline";
import { EpicTicketList } from "./EpicTicketList";
import { EpicTeamPicker } from "./EpicTeamPicker";
import { EpicColorPicker } from "./EpicColorPicker";

interface SprintMeta {
  id: number;
  name: string;
  state: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="font-mono text-body-sm font-semibold tabular-nums text-text-primary">{value}</span>
      <span className="text-caption uppercase tracking-wide text-text-muted">{label}</span>
    </div>
  );
}

export function EpicRow({ epic, sprints }: { epic: EpicProgressItem; sprints: SprintMeta[] }) {
  const [expanded, setExpanded] = useState(false);
  const color = useEpicColor(epic.key);

  return (
    <div
      className="overflow-hidden rounded-xl border border-border-default bg-surface-elevated shadow-sm transition-colors duration-150"
      style={{ borderLeft: `3px solid ${color.text}` }}
    >
      {/* Header row — expand button + team picker as siblings (no nested buttons) */}
      <div className="flex items-center transition-colors duration-150 hover:bg-surface-elevated-hover">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="group flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-default"
      >
        <ChevronRight
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-text-tertiary transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />

        <div className="flex min-w-0 flex-[2] items-center gap-2.5">
          <span
            className="rounded-[4px] border-l-2 px-2 py-0.5 text-body-sm font-semibold tracking-wide"
            style={{ backgroundColor: color.bg, color: color.text, borderLeftColor: color.text }}
          >
            <span className="truncate">{epic.name}</span>
          </span>
          <Link
            href={`/tickets/${epic.key}`}
            onClick={(e) => e.stopPropagation()}
            title={`Open ${epic.key}`}
            className="inline-flex items-center gap-1 rounded font-mono text-label text-text-muted transition-colors duration-150 cursor-pointer hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            {epic.key}
            <ArrowUpRight size={11} strokeWidth={2} className="opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </Link>
        </div>

        <div className="hidden shrink-0 items-center gap-6 md:flex">
          <Stat label="Tickets" value={`${epic.completedTickets}/${epic.totalTickets}`} />
          <Stat
            label="Points"
            value={epic.totalPoints > 0 ? `${epic.completedPoints}/${epic.totalPoints}` : "—"}
          />
        </div>

        <div className="flex-[2]">
          <EpicProgressBar epic={epic} />
        </div>
      </button>

        <div className="flex shrink-0 items-center gap-0.5 pr-3">
          <Link
            href={`/epics/${epic.key}/write`}
            onClick={(e) => e.stopPropagation()}
            title="Work out Epic"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-label font-medium text-text-tertiary transition-colors duration-150 cursor-pointer hover:bg-hover-interactive hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <NotebookPen size={13} strokeWidth={1.5} />
            <span className="hidden sm:inline">Work out Epic</span>
          </Link>
          <EpicColorPicker epicKey={epic.key} name={epic.name} color={epic.color} />
          <EpicTeamPicker epicKey={epic.key} teams={epic.teams} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border-subtle bg-surface-base/40 px-4 pb-3 pt-3">
          <div className="mb-1 px-2 text-caption font-semibold uppercase tracking-wider text-text-muted">
            Across recent sprints
          </div>
          <div className="mb-2 px-2">
            <EpicTimeline epic={epic} sprints={sprints} />
          </div>
          <div className="border-t border-border-subtle">
            <EpicTicketList epicKey={epic.key} sprints={sprints} />
          </div>
        </div>
      )}
    </div>
  );
}
