"use client";

/**
 * Drop-zone + bar-alignment exploration (reachable at /dev/exploration/drop-zones).
 *
 * Two goals, one page:
 *   1. Bring the sprint board's top bar and the refinement session bar into the
 *      SAME regular-state anatomy (height, pill shape, spacing, active marker,
 *      underline). Today they diverge: sprint = floating h-7 pills, gap, status
 *      dot; refinement = full-height adjacent tabs, no gap, count badge.
 *   2. Give both bars ONE shared drop-target treatment for drag-and-drop.
 *
 * Layout: "Bars today" shows the current, divergent bars. "Unified" renders the
 * proposed shared anatomy for both contexts; flip "Simulate drag" and pick a
 * treatment to preview how a dragged ticket would land. Nothing is wired to the
 * real app — this is a styling sandbox to choose a direction.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, GripVertical, Inbox, ChevronDown } from "lucide-react";

type DropState = "available" | "over";

interface Treatment {
  id: string;
  name: string;
  blurb: string;
  classFor: (state: DropState) => string;
  styleFor?: (state: DropState) => React.CSSProperties;
  decoration?: (state: DropState) => React.ReactNode;
  cueOpacity: (state: DropState) => number;
}

const TREATMENTS: Treatment[] = [
  {
    id: "soft-tint",
    name: "Soft tint",
    blurb: "Quiet wash of brand-teal with brighter text on lock-on. Calm, never shouts.",
    classFor: (s) =>
      s === "over"
        ? "border-[var(--color-brand-500)]/55 bg-[var(--color-brand-500)]/12 text-[var(--color-brand-600)]"
        : "border-border-strong bg-overlay-default text-text-secondary",
    cueOpacity: (s) => (s === "over" ? 0.9 : 0.3),
  },
  {
    id: "ring-lift",
    name: "Brand ring + lift",
    blurb: "Faint ring on available targets; the locked-on one lifts with a soft tinted shadow.",
    classFor: (s) =>
      s === "over"
        ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/12 text-[var(--color-brand-600)]"
        : "border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/[0.05] text-text-secondary",
    styleFor: (s) =>
      s === "over"
        ? { transform: "translateY(-2px) scale(1.02)", boxShadow: "0 8px 20px -8px var(--color-brand-glow)" }
        : {},
    cueOpacity: (s) => (s === "over" ? 1 : 0.4),
  },
  {
    id: "solid",
    name: "Solid fill",
    blurb: "Locked-on target fills solid brand-teal with white text. Boldest, reads instantly.",
    classFor: (s) =>
      s === "over"
        ? "border-transparent bg-[var(--color-brand-500)] text-white"
        : "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/[0.06] text-text-secondary",
    styleFor: (s) =>
      s === "over" ? { transform: "scale(1.03)", boxShadow: "0 6px 18px -6px var(--color-brand-glow)" } : {},
    cueOpacity: (s) => (s === "over" ? 1 : 0.35),
  },
  {
    id: "underline",
    name: "Underline cue",
    blurb: "A brand bar grows in under the target while the fill warms — echoes the active-tab underline.",
    classFor: (s) =>
      s === "over"
        ? "border-transparent bg-[var(--color-brand-500)]/10 text-text-primary"
        : "border-transparent bg-overlay-default text-text-secondary",
    decoration: (s) => (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-1.5 bottom-0 h-[2px] origin-center rounded-full bg-[var(--color-brand-400)]"
        style={{ transform: `scaleX(${s === "over" ? 1 : 0})`, transition: "transform 200ms cubic-bezier(0.34, 1.3, 0.5, 1)" }}
      />
    ),
    cueOpacity: (s) => (s === "over" ? 0.85 : 0),
  },
  {
    id: "spotlight",
    name: "Spotlight",
    blurb: "A soft brand glow blooms from inside the target as the cursor arrives. Luminous, no hard edges.",
    classFor: (s) =>
      s === "over"
        ? "border-[var(--color-brand-400)]/70 text-[var(--color-brand-600)]"
        : "border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.04] text-text-secondary",
    styleFor: (s) => (s === "over" ? { transform: "scale(1.02)" } : {}),
    decoration: (s) => (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md"
        style={{
          background:
            "radial-gradient(120% 140% at 50% 120%, color-mix(in srgb, var(--color-brand-400) 42%, transparent), transparent 70%)",
          opacity: s === "over" ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />
    ),
    cueOpacity: (s) => (s === "over" ? 1 : 0.3),
  },
];

const TAB_TRANSITION =
  "transform 220ms cubic-bezier(0.34, 1.3, 0.5, 1), box-shadow 180ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease";

// Shared unified pill anatomy: a 28px floating pill, used by BOTH bars.
const UNIFIED_PILL =
  "group relative flex h-7 shrink-0 items-center gap-1.5 self-center rounded-md border border-transparent px-2.5 text-body-sm font-medium";

function ActiveUnderline() {
  return <span className="pointer-events-none absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />;
}

function CountBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${
        active ? "bg-overlay-strong text-text-secondary" : "bg-overlay-default text-text-tertiary"
      }`}
    >
      {n}
    </span>
  );
}

/** One unified bar tab. In regular mode it shows the active/inactive treatment;
    when a drag is active it becomes a drop target wearing the chosen treatment. */
function UnifiedTab({
  treatment,
  dragActive,
  active,
  label,
  count,
  dot,
  cue,
  hovered,
  onHover,
}: {
  treatment: Treatment;
  dragActive: boolean;
  active: boolean;
  label: string;
  count?: number;
  dot?: boolean;
  cue: "move" | "add";
  hovered: boolean;
  onHover: (over: boolean) => void;
}) {
  const CueIcon = cue === "move" ? ArrowRight : Plus;
  const dropState: DropState | null = dragActive ? (hovered ? "over" : "available") : null;

  const regularText = active ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary";

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`${UNIFIED_PILL} overflow-hidden cursor-pointer ${dropState ? treatment.classFor(dropState) : regularText}`}
      style={{ transition: TAB_TRANSITION, ...(dropState ? treatment.styleFor?.(dropState) ?? {} : {}) }}
    >
      {dropState && treatment.decoration?.(dropState)}
      {dot && (
        <span
          className={`relative z-10 h-[7px] w-[7px] shrink-0 rounded-full ${active && !dropState ? "bg-[var(--color-brand-400)]" : "bg-overlay-strong"}`}
          style={active && !dropState ? { boxShadow: "0 0 8px var(--color-brand-glow)" } : undefined}
        />
      )}
      <span className="relative z-10">{label}</span>
      {typeof count === "number" && <span className="relative z-10"><CountBadge n={count} active={active} /></span>}
      {dropState && (
        <CueIcon
          size={13}
          strokeWidth={2}
          className="relative z-10 -mr-0.5 shrink-0"
          style={{ opacity: treatment.cueOpacity(dropState), transition: "opacity 160ms ease" }}
        />
      )}
      {active && !dropState && <ActiveUnderline />}
      {!active && !dropState && (
        <span
          className="pointer-events-none absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)] opacity-0 group-hover:opacity-20"
          style={{ transition: "opacity 150ms" }}
        />
      )}
    </button>
  );
}

function BarShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-1.5 overflow-x-auto border-b border-border-default bg-[var(--color-surface-base)] px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

const SPRINTS = [
  { name: "BT: 139", active: true, dot: true },
  { name: "BT: 140", active: false, dot: true },
  { name: "BT: 141", active: false, dot: true },
  { name: "BT: 142", active: false, dot: true },
  { name: "BT: TODO", active: false, dot: false },
];
const SESSIONS = [
  { name: "16 Jun 2026", active: false, count: 3 },
  { name: "arie", active: true, count: 2 },
  { name: "12 Jun 2026", active: false, count: 2 },
];

function UnifiedSprintBar({ treatment, dragActive }: { treatment: Treatment; dragActive: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <BarShell>
      <button
        type="button"
        className="mr-1 flex h-7 shrink-0 items-center self-center rounded-md px-2.5 text-body-sm font-semibold tracking-wide text-[var(--color-brand-600)] cursor-pointer"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-brand-400) 12%, transparent)" }}
      >
        All
      </button>
      <button
        type="button"
        className="mr-2 flex h-7 shrink-0 items-center gap-1.5 self-center rounded-md border border-border-default px-2.5 text-body-sm font-medium text-text-tertiary cursor-pointer"
      >
        <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
        Backlogs
        <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
      </button>
      {SPRINTS.map((s) => (
        <UnifiedTab
          key={s.name}
          treatment={treatment}
          dragActive={dragActive}
          active={s.active}
          label={s.name}
          dot={s.dot}
          cue="move"
          hovered={hovered === s.name}
          onHover={(over) => setHovered(over ? s.name : (h) => (h === s.name ? null : h))}
        />
      ))}
    </BarShell>
  );
}

function UnifiedRefinementBar({ treatment, dragActive }: { treatment: Treatment; dragActive: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <BarShell>
      {SESSIONS.map((s) => (
        <UnifiedTab
          key={s.name}
          treatment={treatment}
          dragActive={dragActive}
          active={s.active}
          label={s.name}
          count={s.count}
          cue="add"
          hovered={hovered === s.name}
          onHover={(over) => setHovered(over ? s.name : (h) => (h === s.name ? null : h))}
        />
      ))}
    </BarShell>
  );
}

/* ----- "Today": faithful renders of the current, divergent bars ----- */

function TodaySprintBar() {
  return (
    <div className="flex h-11 items-center gap-1 overflow-x-auto border-b border-border-default bg-[var(--color-surface-base)] px-4">
      <button type="button" className="mr-2 flex h-7 items-center self-center rounded-md px-2.5 text-body-sm font-semibold tracking-wide text-[var(--color-brand-600)]" style={{ backgroundColor: "color-mix(in srgb, var(--color-brand-400) 18%, transparent)" }}>All</button>
      <button type="button" className="mr-2 flex h-7 items-center gap-1.5 self-center rounded-md border border-border-default px-2.5 text-body-sm font-medium text-text-tertiary"><Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />Backlogs<ChevronDown className="h-3 w-3" strokeWidth={1.75} /></button>
      {SPRINTS.map((s) => (
        <span key={s.name} className={`group relative flex h-7 items-center gap-1.5 self-center px-2.5 text-body-sm font-medium ${s.active ? "text-text-primary" : "text-text-tertiary"}`}>
          {s.dot && <span className={`h-[7px] w-[7px] rounded-full ${s.active ? "bg-[var(--color-brand-400)]" : "bg-overlay-strong"}`} style={s.active ? { boxShadow: "0 0 8px var(--color-brand-glow)" } : undefined} />}
          {s.name}
          {s.active && <span className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />}
        </span>
      ))}
    </div>
  );
}

function TodayRefinementBar() {
  return (
    <div className="flex h-11 items-stretch gap-0 overflow-x-auto border-b border-border-default bg-[var(--color-surface-base)] px-4">
      {SESSIONS.map((s) => (
        <span key={s.name} className={`group relative flex shrink-0 items-center gap-1.5 rounded-md px-3 text-body-sm font-medium ${s.active ? "text-text-primary" : "text-text-tertiary"}`}>
          {s.name}
          <CountBadge n={s.count} active={s.active} />
          {s.active && <span className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />}
        </span>
      ))}
    </div>
  );
}

function GhostTicket() {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] px-2.5 py-1.5 shadow-[var(--shadow-lg)]">
      <GripVertical size={13} strokeWidth={1.5} className="text-text-muted" />
      <span className="font-mono text-body-sm text-text-secondary">VPL-46342</span>
      <span className="max-w-[160px] truncate text-body-sm text-text-primary">Hide prices flow</span>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-caption font-medium uppercase tracking-widest text-text-muted">{label}</p>
      <div className="overflow-hidden rounded-xl border border-border-subtle">{children}</div>
    </div>
  );
}

export default function DropZonesExplorationPage() {
  const [dragActive, setDragActive] = useState(true);
  const [treatmentId, setTreatmentId] = useState(TREATMENTS[1].id);
  const treatment = TREATMENTS.find((t) => t.id === treatmentId) ?? TREATMENTS[0];

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] text-text-primary">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/dev/exploration" className="mb-8 inline-flex items-center gap-1.5 text-body-sm text-text-tertiary transition-colors hover:text-text-secondary">
          <ArrowLeft size={14} strokeWidth={1.5} /> Exploration hub
        </Link>

        <header className="mb-8">
          <h1 className="font-[var(--font-display)] text-heading-lg font-semibold tracking-tight">Drop zones &amp; bar alignment</h1>
          <p className="mt-2 max-w-2xl text-body-lg text-text-tertiary" style={{ lineHeight: 1.7 }}>
            Bring the sprint board bar and the refinement session bar into one shared anatomy, and give both the
            same drop-target treatment for drag-and-drop. Compare today vs. the unified proposal below.
          </p>
        </header>

        {/* TODAY */}
        <section className="mb-10">
          <h2 className="mb-1 font-[var(--font-display)] text-heading font-semibold tracking-tight">Bars today</h2>
          <p className="mb-4 max-w-2xl text-body text-text-tertiary" style={{ lineHeight: 1.7 }}>
            They diverge: the sprint bar uses floating 28px pills with a gap, a status dot and a px-2.5 underline;
            the refinement bar uses full-height adjacent tabs (no gap, px-3) with a count badge and a tighter underline.
          </p>
          <div className="space-y-4">
            <Labeled label="Sprint board — today"><TodaySprintBar /></Labeled>
            <Labeled label="Refinement — today"><TodayRefinementBar /></Labeled>
          </div>
        </section>

        {/* CONTROLS */}
        <div className="sticky top-4 z-20 mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-default bg-[var(--color-surface-floating)]/90 px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border-default bg-[var(--color-surface-base)] p-1">
            {TREATMENTS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTreatmentId(t.id)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-body-sm font-medium ${treatmentId === t.id ? "bg-[var(--color-brand-500)] text-white" : "text-text-tertiary hover:text-text-secondary"}`}
                style={{ transition: "background-color 140ms, color 140ms" }}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block" style={{ opacity: dragActive ? 1 : 0.35, transition: "opacity 200ms ease" }}>
              <GhostTicket />
            </div>
            <button
              type="button"
              onClick={() => setDragActive((v) => !v)}
              role="switch"
              aria-checked={dragActive}
              className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full"
              style={{ backgroundColor: dragActive ? "var(--color-brand-500)" : "var(--color-overlay-strong)", transition: "background-color 160ms ease" }}
              title="Toggle simulated drag"
            >
              <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)]" style={{ transform: dragActive ? "translateX(20px)" : "translateX(0)", transition: "transform 200ms cubic-bezier(0.34, 1.3, 0.5, 1)" }} />
            </button>
          </div>
        </div>

        {/* UNIFIED */}
        <section>
          <h2 className="mb-1 font-[var(--font-display)] text-heading font-semibold tracking-tight">Unified — {treatment.name}</h2>
          <p className="mb-4 max-w-2xl text-body text-text-tertiary" style={{ lineHeight: 1.7 }}>
            Both bars now share one pill: floating h-7, gap-1.5, px-2.5, brand-400 active underline. {treatment.blurb}{" "}
            Flip the switch and hover a pill to preview the drop-over state.
          </p>
          <div className="space-y-4">
            <Labeled label="Sprint board — unified"><UnifiedSprintBar treatment={treatment} dragActive={dragActive} /></Labeled>
            <Labeled label="Refinement — unified"><UnifiedRefinementBar treatment={treatment} dragActive={dragActive} /></Labeled>
          </div>
        </section>
      </div>
    </div>
  );
}
