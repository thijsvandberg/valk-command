"use client";

/**
 * Throwaway exploration: pick a single icon to represent "a sprint", plus decide
 * how the create / edit-sprint affordance should look.
 *
 * The sprint pills in the views bar (SprintSlots.tsx) have no consistent sprint
 * glyph today — active sprints show a live dot, backlogs an Inbox, the rest
 * nothing. We want one icon that reads as "sprint / iteration" and reuse it in
 * two places: on the sprint pills AND on the "Sprint overview" item in the
 * Backlogs dropdown footer.
 *
 * Second question: "New sprint" is buried in the dropdown footer. Should creating
 * a sprint be a first-class "+" button in the bar instead, and where does an edit
 * affordance live? The affordance gallery at the bottom compares the options.
 *
 * Click any candidate to drive the sticky preview. Reachable at
 * /dev/exploration/sprint-icon; not linked from app nav.
 */

import { useState } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  ArrowLeft,
  Inbox,
  ChevronDown,
  Check,
  MoreHorizontal,
  // create / edit
  Plus,
  CirclePlus,
  SquarePlus,
  CalendarPlus,
  Pencil,
  SquarePen,
  // iteration / cycle
  RefreshCw,
  RefreshCcw,
  RotateCw,
  RotateCcw,
  IterationCw,
  IterationCcw,
  Repeat,
  Repeat2,
  Repeat1,
  Orbit,
  Recycle,
  FastForward,
  // time box
  CalendarRange,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  CalendarFold,
  CalendarSync,
  Timer,
  TimerReset,
  Hourglass,
  AlarmClock,
  Clock,
  // goal / outcome
  Target,
  Crosshair,
  Goal,
  Flag,
  FlagTriangleRight,
  Milestone,
  Trophy,
  Mountain,
  MountainSnow,
  TrendingUp,
  // energy / motion
  Zap,
  Rocket,
  Footprints,
  Gauge,
  Activity,
  Wind,
  Bike,
  ChevronsRight,
  Waves,
  // workflow / agile
  Workflow,
  GitBranch,
  GitMerge,
  GitCommitHorizontal,
  SquareKanban,
  ListChecks,
  ListTodo,
  Route,
  Signpost,
  SquareStack,
  LayoutDashboard,
  // neutral marker
  CircleDot,
  CircleDashed,
  CircleDotDashed,
  Circle,
  Box,
  Boxes,
  Hexagon,
  SquareDashed,
  Diamond,
  Package,
  Component,
  Waypoints,
} from "lucide-react";

/* ----------------------------------------------------------- candidates -- */

type Candidate = { key: string; label: string; icon: LucideIcon; note: string };
type Group = { title: string; rationale: string; items: Candidate[] };

const GROUPS: Group[] = [
  {
    title: "Iteration / cycle",
    rationale:
      "A sprint is a repeating, time-boxed loop. Circular-arrow glyphs lean hardest into the agile 'iteration' meaning. (This is the family the screenshot hinted at.)",
    items: [
      { key: "refresh-cw", label: "RefreshCw", icon: RefreshCw, note: "Two arrows in a loop — classic cycle." },
      { key: "refresh-ccw", label: "RefreshCcw", icon: RefreshCcw, note: "Counter-clockwise loop." },
      { key: "rotate-cw", label: "RotateCw", icon: RotateCw, note: "Single sweeping arrow, lighter." },
      { key: "rotate-ccw", label: "RotateCcw", icon: RotateCcw, note: "Reverse single arrow." },
      { key: "iteration-cw", label: "IterationCw", icon: IterationCw, note: "Literally named 'iteration'." },
      { key: "iteration-ccw", label: "IterationCcw", icon: IterationCcw, note: "Iteration, mirrored." },
      { key: "repeat", label: "Repeat", icon: Repeat, note: "Repeat / recur." },
      { key: "repeat-2", label: "Repeat2", icon: Repeat2, note: "Rounder repeat variant." },
      { key: "repeat-1", label: "Repeat1", icon: Repeat1, note: "Repeat-once — a single iteration." },
      { key: "orbit", label: "Orbit", icon: Orbit, note: "Cyclic, but reads more 'system'." },
      { key: "recycle", label: "Recycle", icon: Recycle, note: "Triangular loop." },
      { key: "fast-forward", label: "FastForward", icon: FastForward, note: "Momentum forward." },
    ],
  },
  {
    title: "Time-box",
    rationale:
      "A sprint is a fixed window with a start and end date. Calendar/timer glyphs stress the 'time-boxed' nature and pair naturally with a 'New sprint' calendar-plus.",
    items: [
      { key: "calendar-range", label: "CalendarRange", icon: CalendarRange, note: "A date range — already used in the header." },
      { key: "calendar-clock", label: "CalendarClock", icon: CalendarClock, note: "Dated deadline." },
      { key: "calendar-days", label: "CalendarDays", icon: CalendarDays, note: "Generic calendar." },
      { key: "calendar-check", label: "CalendarCheck", icon: CalendarCheck, note: "A committed/agreed window." },
      { key: "calendar-fold", label: "CalendarFold", icon: CalendarFold, note: "Compact calendar." },
      { key: "calendar-sync", label: "CalendarSync", icon: CalendarSync, note: "Calendar + cycle — best of both." },
      { key: "timer", label: "Timer", icon: Timer, note: "Countdown — sprint is running out." },
      { key: "timer-reset", label: "TimerReset", icon: TimerReset, note: "Reset each sprint." },
      { key: "hourglass", label: "Hourglass", icon: Hourglass, note: "Time passing." },
      { key: "alarm-clock", label: "AlarmClock", icon: AlarmClock, note: "Deadline." },
      { key: "clock", label: "Clock", icon: Clock, note: "Plain time." },
    ],
  },
  {
    title: "Goal / outcome",
    rationale:
      "A sprint exists to hit a goal. Target/flag glyphs frame it by its purpose rather than its shape.",
    items: [
      { key: "target", label: "Target", icon: Target, note: "Sprint goal / focus." },
      { key: "crosshair", label: "Crosshair", icon: Crosshair, note: "Precise aim." },
      { key: "goal", label: "Goal", icon: Goal, note: "Net — reaching the goal." },
      { key: "flag", label: "Flag", icon: Flag, note: "Already used for 'Finish sprint'." },
      { key: "flag-triangle", label: "FlagTriangleRight", icon: FlagTriangleRight, note: "Checkered-flag feel." },
      { key: "milestone", label: "Milestone", icon: Milestone, note: "A marker on the road." },
      { key: "trophy", label: "Trophy", icon: Trophy, note: "Win at the end." },
      { key: "mountain", label: "Mountain", icon: Mountain, note: "A peak to reach." },
      { key: "mountain-snow", label: "MountainSnow", icon: MountainSnow, note: "Summit." },
      { key: "trending-up", label: "TrendingUp", icon: TrendingUp, note: "Progress — already a BV badge." },
    ],
  },
  {
    title: "Energy / motion",
    rationale:
      "Plays on the literal word 'sprint' — speed and forward motion. Punchy, but less precise about meaning.",
    items: [
      { key: "zap", label: "Zap", icon: Zap, note: "Fast burst of effort." },
      { key: "rocket", label: "Rocket", icon: Rocket, note: "Launch / push." },
      { key: "footprints", label: "Footprints", icon: Footprints, note: "Running — literal sprint." },
      { key: "gauge", label: "Gauge", icon: Gauge, note: "Velocity." },
      { key: "activity", label: "Activity", icon: Activity, note: "Live pulse." },
      { key: "wind", label: "Wind", icon: Wind, note: "Speed / flow." },
      { key: "bike", label: "Bike", icon: Bike, note: "Pace." },
      { key: "chevrons-right", label: "ChevronsRight", icon: ChevronsRight, note: "Push forward." },
      { key: "waves", label: "Waves", icon: Waves, note: "Rhythm of sprints." },
    ],
  },
  {
    title: "Workflow / agile",
    rationale:
      "Frames a sprint by the process it belongs to — a board, a branch, a planned route. Reads 'method' more than 'time'.",
    items: [
      { key: "workflow", label: "Workflow", icon: Workflow, note: "A flow of work." },
      { key: "square-kanban", label: "SquareKanban", icon: SquareKanban, note: "The board itself." },
      { key: "git-branch", label: "GitBranch", icon: GitBranch, note: "A branch of work." },
      { key: "git-merge", label: "GitMerge", icon: GitMerge, note: "Converging to done." },
      { key: "git-commit", label: "GitCommitHorizontal", icon: GitCommitHorizontal, note: "A point on the timeline." },
      { key: "list-checks", label: "ListChecks", icon: ListChecks, note: "The sprint backlog." },
      { key: "list-todo", label: "ListTodo", icon: ListTodo, note: "Planned items." },
      { key: "route", label: "Route", icon: Route, note: "A planned path." },
      { key: "signpost", label: "Signpost", icon: Signpost, note: "Direction." },
      { key: "square-stack", label: "SquareStack", icon: SquareStack, note: "A stack of work." },
      { key: "layout-dashboard", label: "LayoutDashboard", icon: LayoutDashboard, note: "The board layout." },
    ],
  },
  {
    title: "Neutral marker",
    rationale:
      "Quiet, abstract tokens. They don't argue a meaning — they just label the row as 'a sprint' without competing with the text.",
    items: [
      { key: "circle-dot", label: "CircleDot", icon: CircleDot, note: "Echoes the current live-dot." },
      { key: "circle-dashed", label: "CircleDashed", icon: CircleDashed, note: "An open period." },
      { key: "circle-dot-dashed", label: "CircleDotDashed", icon: CircleDotDashed, note: "In-progress ring." },
      { key: "circle", label: "Circle", icon: Circle, note: "Minimal." },
      { key: "box", label: "Box", icon: Box, note: "A 'box' of work." },
      { key: "boxes", label: "Boxes", icon: Boxes, note: "Several items." },
      { key: "package", label: "Package", icon: Package, note: "A shippable increment." },
      { key: "hexagon", label: "Hexagon", icon: Hexagon, note: "Neutral token." },
      { key: "diamond", label: "Diamond", icon: Diamond, note: "A distinct unit." },
      { key: "square-dashed", label: "SquareDashed", icon: SquareDashed, note: "A defined slot." },
      { key: "component", label: "Component", icon: Component, note: "A module of work." },
      { key: "waypoints", label: "Waypoints", icon: Waypoints, note: "A planned sequence." },
    ],
  },
];

const ALL: Candidate[] = GROUPS.flatMap((g) => g.items);

/* -------------------------------------------------------------- preview -- */

// Faux sprint pill matching SortableTab in SprintSlots.tsx, but with the
// candidate icon prefixing the name on every sprint.
function PillPreview({ icon: Icon, name, active, live }: { icon: LucideIcon; name: string; active?: boolean; live?: boolean }) {
  return (
    <div className="relative flex h-7 items-center gap-1.5 px-2.5 text-body-sm font-medium" style={{ transition: "color 120ms" }}>
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[var(--color-brand-400)]" : "text-text-muted"}`}
        strokeWidth={1.5}
      />
      <span className={active ? "text-text-primary" : "text-text-tertiary"}>{name}</span>
      {live && (
        <span className="relative ml-0.5 inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-brand-400)] opacity-40" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
        </span>
      )}
      {active && <span className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />}
    </div>
  );
}

function BacklogsChip() {
  return (
    <span className="flex h-7 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-body-sm font-medium text-text-tertiary">
      <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
      Backlogs
      <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
    </span>
  );
}

function LivePreview({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default shadow-[0_18px_44px_-24px_rgba(0,0,0,0.5)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-brand-400)]">Live preview</p>
        <span className="rounded-md bg-overlay-default px-2 py-0.5 font-mono text-[11px] text-text-secondary">{label}</span>
      </div>

      {/* Context 1: the views bar */}
      <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-text-muted">On the sprint pills</p>
      <div className="flex h-11 items-center gap-1 rounded-xl bg-[var(--color-surface-base)] px-2 ring-1 ring-border-default">
        <span className="mr-1 flex h-7 items-center rounded-md px-2.5 text-body-sm font-semibold tracking-wide text-[var(--color-brand-500)]">All</span>
        <BacklogsChip />
        <span className="mx-1 h-4 w-px bg-border-default" />
        <PillPreview icon={Icon} name="BT: 139" active live />
        <PillPreview icon={Icon} name="BT: 140" />
        <PillPreview icon={Icon} name="BT: 141" />
      </div>

      {/* Context 2: the Backlogs dropdown footer */}
      <p className="mb-2 mt-5 text-[11px] uppercase tracking-[0.1em] text-text-muted">In the Backlogs dropdown footer</p>
      <div className="w-56 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] p-1 shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-sm text-text-tertiary">
          <Inbox className="h-3.5 w-3.5 shrink-0 text-text-tertiary" strokeWidth={1.5} />
          <span className="flex-1">BT: Backlog</span>
          <span className="text-[11px] tabular-nums text-text-muted">139</span>
        </div>
        <div className="my-1 h-px bg-border-subtle" />
        <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-sm text-text-secondary">
          <Icon className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />
          Sprint overview
        </div>
        <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-body-sm text-text-secondary">
          <CalendarPlus className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />
          New sprint
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------- create / edit ------ */

// Each affordance variant is rendered in a realistic mini views-bar so the
// create (and edit) buttons can be judged in context, next to real pills.
type Affordance = { key: string; title: string; blurb: string; render: (Icon: LucideIcon, Add: LucideIcon) => React.ReactNode };

function GhostIconBtn({ children, brand, title }: { children: React.ReactNode; brand?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`grid h-7 w-7 place-items-center rounded-md cursor-pointer transition-colors duration-100 ${
        brand
          ? "text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/[0.1]"
          : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
      }`}
    >
      {children}
    </span>
  );
}

function MiniBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-11 items-center gap-1 rounded-xl bg-[var(--color-surface-base)] px-2 ring-1 ring-border-default">
      <span className="mr-1 flex h-7 items-center rounded-md px-2.5 text-body-sm font-semibold tracking-wide text-[var(--color-brand-500)]">All</span>
      <BacklogsChip />
      <span className="mx-1 h-4 w-px bg-border-default" />
      {children}
    </div>
  );
}

const AFFORDANCES: Affordance[] = [
  {
    key: "footer",
    title: "A · In the dropdown footer (current)",
    blurb:
      "Create + overview live inside the Backlogs dropdown. Tidiest bar, but creating is two clicks and not discoverable — nothing in the bar says 'you can make a sprint here'.",
    render: (Icon) => (
      <MiniBar>
        <PillPreview icon={Icon} name="BT: 139" active live />
        <PillPreview icon={Icon} name="BT: 140" />
        <span className="ml-auto" />
        <GhostIconBtn title="More"><MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} /></GhostIconBtn>
      </MiniBar>
    ),
  },
  {
    key: "trailing-plus",
    title: "B · Trailing + after the pills (new-tab pattern)",
    blurb:
      "A quiet + sits right after the last sprint pill, like a browser new-tab button. Strongest 'add another sprint' read; one click; sits exactly where a new pill would appear.",
    render: (Icon, Add) => (
      <MiniBar>
        <PillPreview icon={Icon} name="BT: 139" active live />
        <PillPreview icon={Icon} name="BT: 140" />
        <PillPreview icon={Icon} name="BT: 141" />
        <GhostIconBtn title="New sprint"><Add className="h-4 w-4" strokeWidth={1.75} /></GhostIconBtn>
      </MiniBar>
    ),
  },
  {
    key: "plus-edit-pair",
    title: "C · + create paired with an edit pencil",
    blurb:
      "Create (+) and edit (pencil, acts on the active sprint) sit together after the pills. Surfaces both sprint actions without a menu — but two always-on buttons add weight to the bar.",
    render: (Icon, Add) => (
      <MiniBar>
        <PillPreview icon={Icon} name="BT: 139" active live />
        <PillPreview icon={Icon} name="BT: 140" />
        <span className="mx-1 h-4 w-px bg-border-default" />
        <GhostIconBtn title="Edit active sprint"><Pencil className="h-3.5 w-3.5" strokeWidth={1.5} /></GhostIconBtn>
        <GhostIconBtn title="New sprint" brand><Add className="h-4 w-4" strokeWidth={1.75} /></GhostIconBtn>
      </MiniBar>
    ),
  },
  {
    key: "edit-on-active",
    title: "D · Edit on the active pill, + trailing",
    blurb:
      "Edit is contextual: a pencil reveals on hover/focus of the active sprint pill (edit what you're looking at), while + stays trailing for create. Keeps the bar light; edit is where the sprint is.",
    render: (Icon, Add) => (
      <MiniBar>
        <span className="relative flex h-7 items-center gap-1.5 rounded-md bg-overlay-subtle pl-2.5 pr-1.5 text-body-sm font-medium">
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.5} />
          <span className="text-text-primary">BT: 139</span>
          <span className="ml-0.5 grid h-5 w-5 place-items-center rounded text-text-muted hover:text-text-secondary" title="Edit sprint">
            <Pencil className="h-3 w-3" strokeWidth={1.5} />
          </span>
          <span className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />
        </span>
        <PillPreview icon={Icon} name="BT: 140" />
        <GhostIconBtn title="New sprint"><Add className="h-4 w-4" strokeWidth={1.75} /></GhostIconBtn>
      </MiniBar>
    ),
  },
  {
    key: "split-button",
    title: "E · Split control: + with a ▾ for more",
    blurb:
      "A primary + (New sprint) with an attached chevron that opens overview / edit. One compact control carries create as the default action and tucks the rest behind the caret.",
    render: (Icon, Add) => (
      <MiniBar>
        <PillPreview icon={Icon} name="BT: 139" active live />
        <PillPreview icon={Icon} name="BT: 140" />
        <span className="ml-1 flex items-center overflow-hidden rounded-md border border-border-default">
          <span className="flex h-7 items-center gap-1 px-2 text-body-sm font-medium text-text-secondary hover:bg-overlay-default cursor-pointer" title="New sprint">
            <Add className="h-3.5 w-3.5" strokeWidth={1.75} />
            Sprint
          </span>
          <span className="h-7 w-px bg-border-default" />
          <span className="grid h-7 w-6 place-items-center text-text-muted hover:bg-overlay-default cursor-pointer" title="More sprint actions">
            <ChevronDown className="h-3 w-3" strokeWidth={1.75} />
          </span>
        </span>
      </MiniBar>
    ),
  },
];

// Icon options specifically for the create button itself.
const CREATE_ICONS: Candidate[] = [
  { key: "plus", label: "Plus", icon: Plus, note: "Neutral, universal 'add'." },
  { key: "circle-plus", label: "CirclePlus", icon: CirclePlus, note: "Softer, more button-like." },
  { key: "square-plus", label: "SquarePlus", icon: SquarePlus, note: "Echoes a tab/card." },
  { key: "calendar-plus", label: "CalendarPlus", icon: CalendarPlus, note: "Says 'new sprint' specifically." },
];

/* ----------------------------------------------------------------- page -- */

export default function SprintIconExplorationPage() {
  const [selectedKey, setSelectedKey] = useState("refresh-cw");
  const [createKey, setCreateKey] = useState("plus");
  const selected = ALL.find((c) => c.key === selectedKey) ?? ALL[0];
  const createIcon = CREATE_ICONS.find((c) => c.key === createKey) ?? CREATE_ICONS[0];

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[920px]">
        <Link
          href="/dev/exploration"
          className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          All explorations
        </Link>

        <header className="mb-8">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Pick a sprint icon
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            One glyph to represent &ldquo;a sprint&rdquo;, reused on the sprint pills and on the
            &ldquo;Sprint overview&rdquo; item in the Backlogs dropdown. Click a candidate to see it live in both
            spots. The active pill keeps its live dot.
          </p>
        </header>

        <div className="sticky top-4 z-10 mb-10">
          <LivePreview icon={selected.icon} label={selected.label} />
        </div>

        <div className="space-y-10">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{group.title}</h2>
              <p className="mb-4 mt-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">{group.rationale}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((c) => {
                  const isSelected = c.key === selectedKey;
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSelectedKey(c.key)}
                      className={`group flex flex-col gap-3 rounded-xl p-4 text-left ring-1 transition-[transform,box-shadow,background-color] duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                        isSelected
                          ? "bg-[var(--color-surface-floating)] ring-[var(--color-brand-400)] shadow-[0_18px_44px_-22px_rgba(0,0,0,0.6)]"
                          : "bg-[var(--color-surface-floating)] ring-border-default hover:-translate-y-0.5 hover:ring-border-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`grid h-10 w-10 place-items-center rounded-lg ${
                            isSelected ? "bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]" : "bg-overlay-default text-text-secondary"
                          }`}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.5} />
                        </span>
                        <code className="font-mono text-[11px] text-text-muted">{c.label}</code>
                      </div>
                      {/* inline pill sample so each card is comparable at a glance */}
                      <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-tertiary">
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                        BT: 140
                      </span>
                      <p className="text-[12px] leading-[1.5] text-text-muted">{c.note}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* ----------------------------------------------- create / edit -- */}
        <div className="mt-16 border-t border-border-default pt-10">
          <header className="mb-6">
            <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-text-primary">
              Create &amp; edit affordance
            </h2>
            <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
              &ldquo;New sprint&rdquo; is buried in the dropdown footer today. Should creating a sprint be a
              first-class <span className="font-medium text-text-primary">+</span> button in the bar, and where
              does editing a sprint belong? Each option is rendered in a real mini bar (using your selected
              sprint icon).
            </p>
          </header>

          {/* which + icon */}
          <div className="mb-8">
            <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-text-muted">Icon for the create button</p>
            <div className="flex flex-wrap gap-2">
              {CREATE_ICONS.map((c) => {
                const isSel = c.key === createKey;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCreateKey(c.key)}
                    title={c.note}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm ring-1 transition-colors cursor-pointer ${
                      isSel
                        ? "bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-300)] ring-[var(--color-brand-400)]"
                        : "bg-[var(--color-surface-floating)] text-text-secondary ring-border-default hover:ring-border-strong"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.6} />
                    <code className="font-mono text-[11px]">{c.label}</code>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            {AFFORDANCES.map((a) => (
              <div key={a.key} className="rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
                <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-primary">{a.title}</h3>
                <p className="mb-4 mt-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">{a.blurb}</p>
                {a.render(selected.icon, createIcon.icon)}
              </div>
            ))}
          </div>

          <p className="mt-6 max-w-2xl text-body-sm leading-[1.6] text-text-muted">
            Note: in variants B–D the + uses your chosen create icon ({createIcon.label}); the sprint pills use
            your chosen sprint icon ({selected.label}). Variant E shows a label-bearing split button.
          </p>
        </div>
      </div>
    </div>
  );
}
