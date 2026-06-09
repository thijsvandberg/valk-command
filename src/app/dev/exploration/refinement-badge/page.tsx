"use client";

/**
 * Throwaway exploration: the small per-ticket meta markers that ride at the right
 * edge of an issue row — Refinement (session), SP (story points / effort) and BV
 * (business value). They should read as a *family*: recognizable apart, clearly the
 * same kind of thing.
 *
 * THEME NOTE: the app flips theme via the [data-theme] attribute on <html>, and this
 * project has no working Tailwind `dark:` variant. So the chips can't use a fixed
 * Tailwind shade (a light pastel vanishes on a white surface, a dark one vanishes on
 * a dark surface). Instead every chip carries its hue as two CSS vars (--fg-d for
 * dark theme, --fg-l for light) and a `.expfg` rule swaps them per [data-theme]; the
 * fill is a transparent color-mix tint that composites correctly over either surface.
 *
 * Sections: (1) refinement glyph candidates by metaphor; (2) the marker family —
 * colour palettes + SP/BV icon options + a penciled-SP draft; (3) all three in a
 * faithful Sprint Board clone; (4) labelled badge treatments for refinement.
 * Reachable at /dev/exploration/refinement-badge. Not linked from app nav.
 */

import Link from "next/link";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ArrowLeft,
  Sun,
  Moon,
  Bookmark,
  Pin,
  Plus,
  MoreHorizontal,
  AlertTriangle,
  HelpCircle,
  SquareCheckBig,
  PencilRuler,
  WandSparkles,
  Crop,
  Pickaxe,
  Spline,
  Hammer,
  Layers,
  Puzzle,
  Boxes,
  Combine,
  Split,
  GitBranch,
  ScanSearch,
  Microscope,
  Lightbulb,
  Filter,
  Sparkles,
  SlidersHorizontal,
  Scale,
  Ruler,
  IterationCw,
  RefreshCw,
  ListChecks,
  BadgeCheck,
  Target,
  CheckCheck,
  MessagesSquare,
  Users,
  Sprout,
  Telescope,
  Waypoints,
  Compass,
  Hash,
  Gauge,
  Dumbbell,
  Zap,
  TrendingUp,
  Star,
  Coins,
  Trophy,
  Pencil,
  Gem,
  type LucideIcon,
} from "lucide-react";

/* ================================================================== *
 * Theme-aware chip hue system.
 * Each hue carries: d = light text for DARK theme, l = dark text for
 * LIGHT theme, s = the 500 used for the transparent fill, sw = swatch.
 * ================================================================== */

type ChipStyle = { fgD: string; fgL: string; bg: string; swatch: string };

const C = {
  slate: { d: "#cbd5e1", l: "#475569", s: "#64748b", sw: "#94a3b8" },
  zinc: { d: "#d4d4d8", l: "#52525b", s: "#71717a", sw: "#a1a1aa" },
  violet: { d: "#c4b5fd", l: "#6d28d9", s: "#8b5cf6", sw: "#a78bfa" },
  fuchsia: { d: "#f0abfc", l: "#a21caf", s: "#d946ef", sw: "#e879f9" },
  indigo: { d: "#a5b4fc", l: "#4338ca", s: "#6366f1", sw: "#818cf8" },
  pink: { d: "#f9a8d4", l: "#be185d", s: "#ec4899", sw: "#f472b6" },
  cyan: { d: "#67e8f9", l: "#0e7490", s: "#06b6d4", sw: "#22d3ee" },
  amber: { d: "#fcd34d", l: "#b45309", s: "#f59e0b", sw: "#fbbf24" },
  sky: { d: "#7dd3fc", l: "#0369a1", s: "#0ea5e9", sw: "#38bdf8" },
  emerald: { d: "#6ee7b7", l: "#047857", s: "#10b981", sw: "#34d399" },
  rose: { d: "#fda4af", l: "#be123c", s: "#f43f5e", sw: "#fb7185" },
  blue: { d: "#93c5fd", l: "#1d4ed8", s: "#3b82f6", sw: "#60a5fa" },
} as const;

type Hue = keyof typeof C;

function chip(h: Hue): ChipStyle {
  const c = C[h];
  return { fgD: c.d, fgL: c.l, bg: `color-mix(in srgb, ${c.s} 18%, transparent)`, swatch: c.sw };
}

/** Refinement uses the brand teal, theme-aware via the brand token scale. */
const REFINE_STYLE: ChipStyle = {
  fgD: "var(--color-brand-300)",
  fgL: "var(--color-brand-700)",
  bg: "color-mix(in srgb, var(--color-brand-500) 18%, transparent)",
  swatch: "var(--color-brand-400)",
};

/** Inline CSS vars for a chip's theme-aware foreground. */
function fgVars(s: ChipStyle): React.CSSProperties {
  return { "--fg-d": s.fgD, "--fg-l": s.fgL } as React.CSSProperties;
}

type Marker = { id: "refine" | "sp" | "bv"; name: string; Icon: LucideIcon; style: ChipStyle };

const MARKERS: Record<Marker["id"], Marker> = {
  refine: { id: "refine", name: "Refinement", Icon: Boxes, style: REFINE_STYLE },
  sp: { id: "sp", name: "Story Points", Icon: Hash, style: chip("slate") },
  bv: { id: "bv", name: "Business Value", Icon: TrendingUp, style: chip("violet") },
};

function withStyle(base: Marker, s: ChipStyle): Marker {
  return { ...base, style: s };
}

/* ---- shared chip primitives ---- */

/** Numeric meta chip (SP / BV). `draft` = dashed "penciled in" sub-variant (same outer size). */
function Chip({
  s,
  Icon,
  children,
  draft = false,
  className = "inline-flex",
}: {
  s: ChipStyle;
  Icon: LucideIcon;
  children?: React.ReactNode;
  draft?: boolean;
  className?: string;
}) {
  const style = fgVars(s);
  if (!draft) style.background = s.bg;
  return (
    <span
      className={`expfg shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[12px] font-medium tabular-nums ${draft ? "border-dashed" : "border-transparent"} ${className}`}
      style={style}
    >
      <Icon size={12} strokeWidth={1.9} className={draft ? "opacity-70" : ""} />
      {children}
    </span>
  );
}

/** Icon-only refinement marker (no number), theme-aware brand teal. */
function RefineMarker({ Icon = MARKERS.refine.Icon }: { Icon?: LucideIcon }) {
  return (
    <span
      className="expfg grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--color-brand-500)]/[0.12]"
      style={fgVars(REFINE_STYLE)}
    >
      <Icon size={15} strokeWidth={1.8} />
    </span>
  );
}

/** Small inline legend glyph in body copy. */
function LegendIcon({ s, Icon, size = 12 }: { s: ChipStyle; Icon: LucideIcon; size?: number }) {
  return (
    <span className="expfg inline align-[-2px]" style={fgVars(s)}>
      <Icon size={size} strokeWidth={1.9} />
    </span>
  );
}

/* ================================================================== *
 * Colour palettes — guiding rule: stay off the traffic-light status hues
 * (amber=warning, red/rose=error, green=success, bright blue=info) so the
 * markers read as metadata. Refinement stays brand teal; the choice is SP+BV.
 * ================================================================== */

type Palette = { id: string; name: string; note: string; group: "cool" | "traffic"; pick?: boolean; sp: ChipStyle; bv: ChipStyle };

const PALETTES: Palette[] = [
  { id: "slate-violet", name: "Slate + Violet", group: "cool", pick: true, note: "Neutral slate SP recedes (effort = structural); violet BV reads 'premium/value'. Both cool — neither borrows a warning/success/error hue.", sp: chip("slate"), bv: chip("violet") },
  { id: "slate-fuchsia", name: "Slate + Fuchsia", group: "cool", note: "Same neutral SP; magenta BV pops harder as 'value' without being a status colour. Brushes the fuchsia label tone.", sp: chip("slate"), bv: chip("fuchsia") },
  { id: "indigo-fuchsia", name: "Indigo + Fuchsia", group: "cool", note: "More colourful: cool indigo effort, magenta value. High separation, both clearly non-status.", sp: chip("indigo"), bv: chip("fuchsia") },
  { id: "indigo-violet", name: "Indigo + Violet", group: "cool", note: "Two cool purples; maximally cohesive and clearly 'metadata'. SP/BV distinction leans on the icons.", sp: chip("indigo"), bv: chip("violet") },
  { id: "violet-pink", name: "Violet + Pink", group: "cool", note: "All-jewel, soft. SP violet sits near the violet 'Test' status pill, so the icon does the work there.", sp: chip("violet"), bv: chip("pink") },
  { id: "cyan-fuchsia", name: "Cyan + Fuchsia", group: "cool", note: "Brighter cool pair. Cyan sits near brand teal though — can blur with the refinement marker one row over.", sp: chip("cyan"), bv: chip("fuchsia") },
  { id: "zinc-violet", name: "Zinc + Violet", group: "cool", note: "Most 'data-like': pure-neutral zinc SP that fully recedes, violet BV the only colour. Calmest of all.", sp: chip("zinc"), bv: chip("violet") },
  { id: "indigo-gold", name: "Indigo + Gold", group: "traffic", note: "The earlier pick. Gold = value, but indigo+gold together can feel like a caution palette.", sp: chip("indigo"), bv: chip("amber") },
  { id: "sky-amber", name: "Sky + Amber", group: "traffic", note: "Brightest, most legible. Sky = the 'In progress' status and amber = warning — both borrow status meaning.", sp: chip("sky"), bv: chip("amber") },
  { id: "emerald-amber", name: "Emerald + Amber", group: "traffic", note: "Classic green/gold. Reads strongly as success + warning; the most 'stoplight' of the set.", sp: chip("emerald"), bv: chip("amber") },
  { id: "blue-rose", name: "Blue + Rose", group: "traffic", note: "Cool blue effort, warm rose value. High contrast, but rose can read as 'error' in a dense row.", sp: chip("blue"), bv: chip("rose") },
  { id: "emerald-fuchsia", name: "Emerald + Fuchsia", group: "traffic", note: "Green effort (success association), magenta value. Punchy; BV stays non-status, SP doesn't.", sp: chip("emerald"), bv: chip("fuchsia") },
];

/* ================================================================== *
 * Faux table data — a faithful clone of the live Sprint Board rows.
 * ================================================================== */

type LeadType = "task" | "spike" | "story";
type Status = "todo" | "prog" | "test";
type Tone = "cyan" | "fuchsia" | "orange" | "emerald" | "violet";

type Row = {
  key: string;
  lead: LeadType;
  status: Status;
  title: string;
  refined: boolean;
  label?: { text: string; tone: Tone };
  bv?: number;
  sp?: number;
  spDraft?: boolean;
  avatar?: { initials: string; bg: string };
};

const ROWS: Row[] = [
  { key: "VPL-29223", lead: "task", status: "todo", title: "Monitoring Kibana (PROD) & heartbeat channel", refined: false, label: { text: "Logging & metrics", tone: "cyan" } },
  { key: "VPL-46239", lead: "spike", status: "todo", title: "Spike: availability broken on UAT1 - no valid Shiji room GUID mapping", refined: false, sp: 1, avatar: { initials: "RB", bg: "bg-amber-700/80" } },
  { key: "VPL-46101", lead: "spike", status: "test", title: "Display strikethrough (original) price per rate in room results", refined: true, label: { text: "BT: Rooms (availability)", tone: "fuchsia" }, sp: 3, avatar: { initials: "FV", bg: "bg-violet-600/80" } },
  { key: "VPL-45991", lead: "story", status: "prog", title: "Auto select correct hotel for BT based on hotel domain", refined: false, bv: 5, sp: 6, avatar: { initials: "RB", bg: "bg-amber-700/80" } },
  { key: "VPL-46304", lead: "spike", status: "test", title: "Research Valk Loyal SOAP security", refined: true, label: { text: "Tech: Security / privacy", tone: "orange" }, avatar: { initials: "FV", bg: "bg-violet-600/80" } },
  { key: "VPL-42510", lead: "story", status: "test", title: "[Initial-sync] Implement initial restrictions sync", refined: false, label: { text: "ARIE", tone: "emerald" }, bv: 5, sp: 3, avatar: { initials: "DK", bg: "bg-rose-700/80" } },
  { key: "VPL-45948", lead: "story", status: "prog", title: "Add and remove group codes manually in the bookingtool", refined: true, label: { text: "Group Reservations", tone: "fuchsia" }, bv: 2, sp: 3, spDraft: true, avatar: { initials: "VV", bg: "bg-indigo-600/80" } },
  { key: "VPL-45943", lead: "story", status: "prog", title: "Restrict booking calendar to group dates to group reservation date range/shoulder", refined: false, label: { text: "Group Reservations", tone: "fuchsia" }, bv: 2, sp: 4, avatar: { initials: "FV", bg: "bg-violet-600/80" } },
];

/** Label pills — outline, theme-aware via the brand-scale-free approach (kept as in the real app). */
const LABEL_TONE: Record<Tone, ChipStyle> = {
  cyan: chip("cyan"),
  fuchsia: chip("fuchsia"),
  orange: chip("amber"),
  emerald: chip("emerald"),
  violet: chip("violet"),
};

const STATUS_META: Record<Status, { label: string; dot: string }> = {
  todo: { label: "Todo", dot: "bg-zinc-400" },
  prog: { label: "Prog", dot: "bg-sky-400" },
  // TEST moves off violet (now used by BV) to amber — see the status-badge section.
  test: { label: "Test", dot: "bg-amber-400" },
};

/* ---- proposed status-badge colour set ---- *
 * Statuses ARE the place for semantic/progression colour (markers deliberately
 * aren't). They must avoid the three marker hues: teal (refine), slate (SP),
 * violet (BV). Lifecycle = cool→warm→success; the two exception states are muted. */
type StatusDef = { key: string; label: string; count: number; hue: Hue; lane: "lifecycle" | "exception" };

const STATUSES: StatusDef[] = [
  { key: "todo", label: "To do", count: 8, hue: "zinc", lane: "lifecycle" },
  { key: "prog", label: "In progress", count: 5, hue: "sky", lane: "lifecycle" },
  { key: "test", label: "Test", count: 3, hue: "amber", lane: "lifecycle" },
  { key: "done", label: "Done", count: 2, hue: "emerald", lane: "lifecycle" },
  { key: "depr", label: "Deprecated", count: 1, hue: "zinc", lane: "exception" },
  { key: "del", label: "Deleted", count: 0, hue: "rose", lane: "exception" },
];

/** Header-style count pill (full colour: tinted fill + theme-aware text). */
function StatusCountPill({ d }: { d: StatusDef }) {
  const s = chip(d.hue);
  const muted = d.lane === "exception";
  return (
    <span
      className={`expfg inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] ${muted ? "opacity-65" : ""}`}
      style={{ ...fgVars(s), background: s.bg }}
    >
      <span className={muted ? "line-through" : ""}>{d.label}</span>:&nbsp;{d.count}
    </span>
  );
}

/** Row-style status pill (neutral text, colour carried by the dot — as on the real board). */
function StatusRowPill({ d }: { d: StatusDef }) {
  const s = chip(d.hue);
  const muted = d.lane === "exception";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary ${muted ? "opacity-70" : ""}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: muted ? `color-mix(in srgb, ${s.swatch} 60%, transparent)` : s.swatch }} />
      <span className={muted ? "line-through" : ""}>{d.label}</span>
    </span>
  );
}

/* ================================================================== *
 * Refinement-glyph candidates, grouped by metaphor.
 * ================================================================== */

type Direction = { name: string; rationale: string; Icon: LucideIcon };
type DGroup = { id: string; concept: string; question: string; items: Direction[] };

const GROUPS: DGroup[] = [
  {
    id: "shaping",
    concept: "Shaping / crafting",
    question: "Refinement as an editorial act — turning a rough idea into a precise, buildable spec.",
    items: [
      { name: "Pencil + ruler", Icon: PencilRuler, rationale: "Drafting to spec. Clearly editorial, not a status." },
      { name: "Wand + sparkles", Icon: WandSparkles, rationale: "Polishing into shape. Risk: 'AI' meaning is used elsewhere." },
      { name: "Crop", Icon: Crop, rationale: "Trimming scope down to the essential. Subtle but apt." },
      { name: "Pickaxe", Icon: Pickaxe, rationale: "'Grooming' the backlog — mining a ticket into shape." },
      { name: "Spline", Icon: Spline, rationale: "Shaping a curve / smoothing rough edges. Unusual, ownable." },
      { name: "Hammer", Icon: Hammer, rationale: "Hands-on shaping. Risk: reads as 'build/dev work'." },
    ],
  },
  {
    id: "breakdown",
    concept: "Breaking down",
    question: "Refinement as decomposition — splitting a big item into understood, estimable pieces.",
    items: [
      { name: "Layers", Icon: Layers, rationale: "Pulling a ticket apart into layers. Distinct from other glyphs." },
      { name: "Puzzle", Icon: Puzzle, rationale: "Making the pieces fit. Friendly, clearly 'work being figured out'." },
      { name: "Boxes", Icon: Boxes, rationale: "Sub-tasks / chunks — a ticket broken into understood pieces." },
      { name: "Combine", Icon: Combine, rationale: "Splitting and regrouping scope. Abstract." },
      { name: "Split", Icon: Split, rationale: "Literal story-splitting. Very on-the-nose for refinement." },
      { name: "Git branch", Icon: GitBranch, rationale: "Branching work out. Risk: reads as VCS, not grooming." },
    ],
  },
  {
    id: "examining",
    concept: "Examining / clarifying",
    question: "Refinement as scrutiny — looking closely at a ticket together until it's understood.",
    items: [
      { name: "Scan", Icon: ScanSearch, rationale: "Examining closely. Strong 'we're looking at this' read." },
      { name: "Microscope", Icon: Microscope, rationale: "Most literal 'scrutiny'. Detailed glyph, busy at 15px." },
      { name: "Lightbulb", Icon: Lightbulb, rationale: "Clarifying / the moment it clicks. Maybe too 'idea'-flavoured." },
      { name: "Filter", Icon: Filter, rationale: "Narrowing down to clarity. Risk: reads as a table control." },
      { name: "Sparkles", Icon: Sparkles, rationale: "Polish. Overloaded with 'AI' across the app." },
    ],
  },
  {
    id: "tuning",
    concept: "Tuning / sizing / estimating",
    question: "Refinement as calibration — sizing, estimating and dialing a ticket in.",
    items: [
      { name: "Sliders", Icon: SlidersHorizontal, rationale: "Fine-tuning / dialing in. Clean and unambiguous." },
      { name: "Scale", Icon: Scale, rationale: "Weighing / estimating effort. Risk: overlaps the SP chip's job." },
      { name: "Gauge", Icon: Gauge, rationale: "Readiness level. Risk: collides with the SP/effort chip." },
      { name: "Ruler", Icon: Ruler, rationale: "Sizing the work. Pairs with the 'shaping' family." },
    ],
  },
  {
    id: "iterating",
    concept: "Iterating",
    question: "Refinement as a repeated pass — circling back until it's ready.",
    items: [
      { name: "Refine loop", Icon: IterationCw, rationale: "Iterative shaping. Reads as 'in progress / repeated'." },
      { name: "Refresh", Icon: RefreshCw, rationale: "Reworking. Risk: collides with sync/reload meaning." },
    ],
  },
  {
    id: "readiness",
    concept: "Readiness / done-state",
    question: "Refinement framed by its output — a ticket that is now ready to commit to.",
    items: [
      { name: "Checklist", Icon: ListChecks, rationale: "Leans on the readiness checklist refinement produces." },
      { name: "Badge check", Icon: BadgeCheck, rationale: "'Verified ready'. Clear, but close to a generic done-state." },
      { name: "Target", Icon: Target, rationale: "Getting ready to commit. Implies focus + end-state." },
      { name: "Check-check", Icon: CheckCheck, rationale: "Double-confirmed. Risk: looks like a plain status tick." },
    ],
  },
  {
    id: "collab",
    concept: "Collaboration (it's a session)",
    question: "Refinement as a meeting — tickets grouped into a session the team works through.",
    items: [
      { name: "Discussion", Icon: MessagesSquare, rationale: "A refinement session is a conversation. Maps to 'sessions' model." },
      { name: "People", Icon: Users, rationale: "Team activity. Risk: collides with assignee avatars in the row." },
    ],
  },
  {
    id: "planning",
    concept: "Growth / planning ahead",
    question: "Refinement as forward prep — maturing upcoming work before it's pulled in.",
    items: [
      { name: "Sprout", Icon: Sprout, rationale: "A ticket maturing from rough to ready. Warm, ownable." },
      { name: "Telescope", Icon: Telescope, rationale: "Looking ahead at upcoming work. Forward-planning flavour." },
      { name: "Waypoints", Icon: Waypoints, rationale: "Mapping out the path of the work. Abstract but distinctive." },
      { name: "Compass", Icon: Compass, rationale: "Giving direction / orienting the work. Planning read." },
    ],
  },
];

const ALL_DIRECTIONS = GROUPS.flatMap((g) => g.items);
const CHOSEN = ALL_DIRECTIONS.find((d) => d.name === "Boxes")!;

const SP_ICONS: Direction[] = [
  { name: "Hash", Icon: Hash, rationale: "Points are a number. Neutral, instantly legible. (pick)" },
  { name: "Gauge", Icon: Gauge, rationale: "Current icon — effort meter. Reads a bit like 'speed'." },
  { name: "Layers", Icon: Layers, rationale: "Relative size / complexity. Clashes with refinement 'Layers'." },
  { name: "Dumbbell", Icon: Dumbbell, rationale: "Weight = effort. Playful, maybe too literal." },
  { name: "Zap", Icon: Zap, rationale: "Energy / effort. A touch generic." },
];

const BV_ICONS: Direction[] = [
  { name: "Trending up", Icon: TrendingUp, rationale: "Business impact going up. Clear value read. (pick)" },
  { name: "Star", Icon: Star, rationale: "Importance / priority. Risk: reads as 'favourite'." },
  { name: "Gem", Icon: Gem, rationale: "Literally 'valuable' — and it's free now refinement leaves the gem." },
  { name: "Coins", Icon: Coins, rationale: "Monetary value. Maybe too literal / busy." },
  { name: "Trophy", Icon: Trophy, rationale: "Reward / win. Reads as achievement, not value." },
];

/* ================================================================== *
 * Faithful row primitives.
 * ================================================================== */

function LeadIcon({ lead }: { lead: LeadType }) {
  if (lead === "task") return <SquareCheckBig size={16} strokeWidth={1.8} className="expfg shrink-0" style={fgVars(REFINE_STYLE)} />;
  if (lead === "spike") return <HelpCircle size={16} strokeWidth={1.8} className="expfg shrink-0" style={fgVars(chip("amber"))} />;
  return <Bookmark size={15} strokeWidth={1.8} className="expfg shrink-0" style={fgVars(chip("emerald"))} />;
}

function StatusPill({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function LabelChip({ label }: { label: NonNullable<Row["label"]> }) {
  const s = LABEL_TONE[label.tone];
  return (
    <span
      className="expfg hidden shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium sm:inline-flex"
      style={{ ...fgVars(s), borderColor: "color-mix(in srgb, currentColor 45%, transparent)" }}
    >
      {label.text}
    </span>
  );
}

function AvatarDot({ avatar }: { avatar?: Row["avatar"] }) {
  if (!avatar) {
    return (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-overlay-default">
        <span className="h-2.5 w-2.5 rounded-full ring-1 ring-border-strong" />
      </span>
    );
  }
  return (
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold tracking-tight text-white ${avatar.bg}`}>
      {avatar.initials}
    </span>
  );
}

/** A single faithful board row. */
function FauxRow({
  row,
  refineMarker,
  spM = MARKERS.sp,
  bvM = MARKERS.bv,
}: {
  row: Row;
  refineMarker: React.ReactNode;
  spM?: Marker;
  bvM?: Marker;
}) {
  return (
    <div className="group flex items-center gap-2.5 border-b border-border-subtle px-4 py-2.5 last:border-b-0 hover:bg-overlay-subtle">
      <LeadIcon lead={row.lead} />
      <span className="shrink-0 font-mono text-[13px] text-text-tertiary">{row.key}</span>
      <StatusPill status={row.status} />
      <span className="shrink-0 text-text-muted">·</span>
      <span className="min-w-0 flex-1 truncate text-[14px] text-text-secondary">{row.title}</span>
      {row.refined && refineMarker}
      {row.label && <LabelChip label={row.label} />}
      {row.bv != null && <Chip s={bvM.style} Icon={bvM.Icon} className="hidden md:inline-flex">{row.bv}</Chip>}
      {row.sp != null && <Chip s={spM.style} Icon={spM.Icon} draft={row.spDraft} className="hidden md:inline-flex">{row.sp}</Chip>}
      <AvatarDot avatar={row.avatar} />
    </div>
  );
}

function BoardHeader() {
  return (
    <div className="flex items-center gap-2.5 border-b border-border-default bg-overlay-subtle px-4 py-2.5">
      <Pin size={15} strokeWidth={1.8} className="expfg" style={fgVars(REFINE_STYLE)} fill="currentColor" />
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      <span className="text-[14px] font-semibold text-text-primary">BT: 139</span>
      <span className="rounded-md bg-overlay-default px-1.5 py-0.5 text-[11px] text-text-tertiary">20 items</span>
      <Chip s={MARKERS.bv.style} Icon={MARKERS.bv.Icon}>25</Chip>
      <Chip s={MARKERS.sp.style} Icon={MARKERS.sp.Icon}>34</Chip>
      <span className="ml-1 hidden items-center gap-1.5 lg:flex">
        <span className="rounded-md bg-overlay-default px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-text-tertiary">To do: 8</span>
        <span className="expfg rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ ...fgVars(chip("sky")), background: chip("sky").bg }}>In progress: 5</span>
        <span className="expfg rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ ...fgVars(chip("amber")), background: chip("amber").bg }}>Test: 3</span>
        <span className="expfg rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]" style={{ ...fgVars(chip("emerald")), background: chip("emerald").bg }}>Done: 2</span>
      </span>
      <span className="ml-auto flex items-center gap-2 text-text-tertiary">
        <AlertTriangle size={15} strokeWidth={1.8} className="expfg" style={fgVars(chip("amber"))} />
        <Plus size={16} strokeWidth={1.8} />
        <MoreHorizontal size={16} strokeWidth={1.8} />
      </span>
    </div>
  );
}

function GalleryRow({ d, k }: { d: Direction; k: string }) {
  return (
    <div className="group flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0 hover:bg-overlay-subtle">
      <Bookmark size={14} strokeWidth={1.7} className="expfg shrink-0 opacity-50" style={fgVars(chip("emerald"))} />
      <span className="shrink-0 font-mono text-[12px] text-text-muted">{k}</span>
      <span className="w-[88px] shrink-0 truncate text-[13px] font-medium text-text-primary">{d.name}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-text-tertiary">{d.rationale}</span>
      <RefineMarker Icon={d.Icon} />
    </div>
  );
}

function IconOptionRow({ m, d, value }: { m: Marker; d: Direction; value: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
      <span className="w-[78px] shrink-0 text-[13px] font-medium text-text-primary">{d.name}</span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-text-tertiary">{d.rationale}</span>
      <Chip s={m.style} Icon={d.Icon}>{value}</Chip>
    </div>
  );
}

/* ================================================================== *
 * Refinement badge treatments (labelled, more visible variants).
 * ================================================================== */

const BRAND_FG = { "--fg-d": "var(--color-brand-200)", "--fg-l": "var(--color-brand-700)" } as React.CSSProperties;

type BadgeStyle = { id: string; name: string; note: string; render: (Icon: LucideIcon, label: string) => React.ReactNode };

const BADGE_STYLES: BadgeStyle[] = [
  {
    id: "tonal",
    name: "Tonal pill (icon + label)",
    note: "Most explicit. Brand-tinted fill, reads instantly even when scanning fast.",
    render: (Icon, label) => (
      <span className="expfg inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.01em]" style={{ ...BRAND_FG, background: "color-mix(in srgb, var(--color-brand-500) 16%, transparent)" }}>
        <Icon size={12} strokeWidth={1.9} />
        {label}
      </span>
    ),
  },
  {
    id: "outline",
    name: "Outline pill",
    note: "Lighter weight — a ring instead of a fill. Sits more quietly in a busy row.",
    render: (Icon, label) => (
      <span className="expfg inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-[0.01em]" style={{ ...BRAND_FG, borderColor: "color-mix(in srgb, currentColor 45%, transparent)" }}>
        <Icon size={12} strokeWidth={1.9} />
        {label}
      </span>
    ),
  },
  {
    id: "mono",
    name: "Mono tag",
    note: "Uppercase mono, matches the ticket-key / status-pill typography already in the row.",
    render: (Icon) => (
      <span className="expfg inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ ...BRAND_FG, background: "color-mix(in srgb, var(--color-brand-500) 10%, transparent)", borderColor: "color-mix(in srgb, currentColor 35%, transparent)" }}>
        <Icon size={11} strokeWidth={2} />
        REF
      </span>
    ),
  },
  {
    id: "plain",
    name: "Bare glyph",
    note: "Just the icon in brand teal, like the gem today. Lightest touch; leans on the glyph being recognizable.",
    render: (Icon) => (
      <span className="expfg grid h-6 w-6 place-items-center rounded-md" style={fgVars(REFINE_STYLE)}>
        <Icon size={15} strokeWidth={1.8} />
      </span>
    ),
  },
  {
    id: "left-rail",
    name: "Left accent rail",
    note: "A coloured edge + glyph. Strongest 'this row is different' signal at a glance.",
    render: (Icon, label) => (
      <span className="expfg relative inline-flex items-center gap-2 rounded-md py-1 pl-2.5 pr-2.5" style={{ ...BRAND_FG, background: "color-mix(in srgb, var(--color-brand-500) 9%, transparent)" }}>
        <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--color-brand-400)]" />
        <Icon size={14} strokeWidth={1.8} />
        <span className="text-[11px] font-medium">{label}</span>
      </span>
    ),
  },
];

/* ------------------------------------------------------------------ *
 * Layout helpers
 * ------------------------------------------------------------------ */

function SectionTitle({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
        {n} · {title}
      </h2>
      {hint && <span className="font-mono text-[11px] text-text-muted">{hint}</span>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] ring-1 ring-border-default">{children}</div>;
}

/* ================================================================== *
 * Page.
 * ================================================================== */

export default function RefinementBadgeExplorationPage() {
  const draftRow = ROWS.find((r) => r.spDraft)!;
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      {/* Theme-aware foreground swap for every chip on this page. */}
      <style>{`.expfg{color:var(--fg-d)}[data-theme="light"] .expfg{color:var(--fg-l)}`}</style>

      <div className="mx-auto max-w-[1180px]">
        <div className="mb-7 flex items-center justify-between gap-3">
          <Link
            href="/dev/exploration"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted transition-colors hover:text-[var(--color-brand-300)] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            exploration
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-floating)] px-3 py-1.5 text-[12px] font-medium text-text-secondary ring-1 ring-border-default transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-px hover:text-text-primary hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
          >
            {theme === "dark" ? <Sun size={14} strokeWidth={1.8} /> : <Moon size={14} strokeWidth={1.8} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>

        <header className="mb-10">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/refinement-badge
          </p>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em] text-text-primary">
            Row meta markers — Refinement, SP &amp; BV
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Three small markers ride at the right edge of every issue row. They should read as a{" "}
            <strong className="text-text-secondary">family</strong> — recognizable apart, but obviously the same
            kind of thing. Every chip here is theme-aware (dark text on light, light text on dark), so toggling
            light/dark mode keeps them readable. Pick a refinement glyph, then a colour palette for all three.
          </p>
          <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-status-done)_12%,transparent)] px-3 py-2 text-[12px] leading-[1.5] text-text-secondary ring-1 ring-[color-mix(in_srgb,var(--color-status-done)_30%,transparent)]">
            <span className="font-semibold text-[var(--color-status-done)]">Shipped</span>
            <span>
              The chosen design now lives in the real app — <strong className="text-text-secondary">BRDG-321</strong>{" "}
              (Refinement <span className="text-[var(--color-brand-400)]">Boxes</span> + slate SP + violet BV, dashed
              draft) and <strong className="text-text-secondary">BRDG-322</strong> (status colours). This page is kept
              as reference.
            </span>
          </p>
        </header>

        {/* ===== SECTION 1 ===== */}
        <section className="mb-16">
          <SectionTitle n="1" title="Refinement glyph, by metaphor" hint={`${ALL_DIRECTIONS.length} glyphs · 8 angles`} />
          <p className="mb-5 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            Pick the <em>angle</em> first, then the glyph. <span className="text-[var(--color-brand-400)]">Boxes</span>{" "}
            (under &ldquo;Breaking down&rdquo;) is the current pick. No session count — how many tickets are in a
            refinement isn&apos;t relevant when you&apos;re looking at one ticket.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {GROUPS.map((g) => (
              <Card key={g.id}>
                <div className="border-b border-border-subtle px-4 py-3">
                  <h3 className="text-[14px] font-semibold text-text-primary">{g.concept}</h3>
                  <p className="mt-0.5 text-[12px] leading-[1.5] text-text-tertiary">{g.question}</p>
                </div>
                <div>
                  {g.items.map((d, i) => (
                    <GalleryRow key={d.name} d={d} k={`VPL-${45100 + i * 37 + g.id.length}`} />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* ===== SECTION 2 ===== */}
        <section className="mb-16">
          <SectionTitle n="2" title="The marker family — colour & icon" hint="cohesive · own hue each" />
          <p className="mb-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            <strong className="text-text-secondary">Cohesion:</strong> identical chip geometry, opacity and type
            — only the hue + icon change. <strong className="text-text-secondary">Principle:</strong> stay off the
            traffic-light hues (amber = warning, red/rose = error, green = success), so these read as metadata, not
            states. Refinement stays brand teal; the choice is the SP + BV hues.
          </p>
          <p className="mb-6 text-[12px] text-text-muted">
            Each palette: swatches · the three chips + the dashed SP draft · then two real rows in context.
          </p>

          {(
            [
              { grp: "cool", title: "Cool / jewel — reads as metadata", hint: "off the traffic-light hues" },
              { grp: "traffic", title: "Traffic-light — brighter, ignores the caution", hint: "borrows status meaning" },
            ] as const
          ).map(({ grp, title, hint }) => (
            <div key={grp} className="mb-10 last:mb-0">
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-secondary">{title}</h3>
                <span className="font-mono text-[11px] text-text-muted">{hint}</span>
              </div>
              <div className="space-y-4">
                {PALETTES.filter((p) => p.group === grp).map((p) => {
                  const spM = withStyle(MARKERS.sp, p.sp);
                  const bvM = withStyle(MARKERS.bv, p.bv);
                  return (
                    <Card key={p.id}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: MARKERS.refine.style.swatch }} />
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: spM.style.swatch }} />
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: bvM.style.swatch }} />
                        </div>
                        <h3 className="text-[14px] font-semibold text-text-primary">
                          {p.name}
                          {p.pick && <span className="ml-2 font-normal text-[var(--color-brand-400)]">(pick)</span>}
                        </h3>
                        <p className="order-last w-full text-[12px] leading-[1.5] text-text-tertiary md:order-none md:min-w-0 md:flex-1">
                          {p.note}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <RefineMarker />
                          <Chip s={bvM.style} Icon={bvM.Icon}>8</Chip>
                          <Chip s={spM.style} Icon={spM.Icon}>5</Chip>
                          <Chip s={spM.style} Icon={spM.Icon} draft>5</Chip>
                        </div>
                      </div>
                      <div>
                        {[ROWS[5], ROWS[6]].map((row) => (
                          <FauxRow key={row.key} row={row} refineMarker={<RefineMarker />} spM={spM} bvM={bvM} />
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}

          {/* SP & BV icon options */}
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                <span className="h-2 w-2 rounded-full" style={{ background: MARKERS.sp.style.swatch }} />
                <h3 className="text-[14px] font-semibold text-text-primary">SP icon options</h3>
                <span className="ml-auto font-mono text-[11px] text-text-muted">slate</span>
              </div>
              <div>{SP_ICONS.map((d) => <IconOptionRow key={d.name} m={MARKERS.sp} d={d} value={5} />)}</div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                <span className="h-2 w-2 rounded-full" style={{ background: MARKERS.bv.style.swatch }} />
                <h3 className="text-[14px] font-semibold text-text-primary">BV icon options</h3>
                <span className="ml-auto font-mono text-[11px] text-text-muted">violet</span>
              </div>
              <div>{BV_ICONS.map((d) => <IconOptionRow key={d.name} m={MARKERS.bv} d={d} value={8} />)}</div>
            </Card>
          </div>

          {/* Penciled SP */}
          <h3 className="mb-2 mt-8 text-[15px] font-semibold text-text-primary">Penciled SP (draft estimate)</h3>
          <p className="mb-4 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            For a provisional point value &ldquo;penciled in&rdquo; during refinement. Chosen approach: a dashed
            sub-variant of the SP chip — the dashed border is inset (the filled chip reserves the same 1px), so the
            draft is exactly the same size as the committed chip.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
              <div className="mb-4 flex min-h-[2rem] items-center"><Chip s={MARKERS.sp.style} Icon={Pencil}>5</Chip></div>
              <h4 className="text-[13px] font-semibold text-text-primary">A · Pencil icon</h4>
              <p className="mt-1 text-[12px] leading-[1.5] text-text-tertiary">Swaps the hash for a pencil. Clear &ldquo;draft&rdquo; read, but loses the SP icon identity.</p>
            </div>
            <div className="rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
              <div className="mb-4 flex min-h-[2rem] items-center"><Chip s={MARKERS.sp.style} Icon={Hash} draft>5</Chip></div>
              <h4 className="text-[13px] font-semibold text-text-primary">B · Dashed sub-variant <span className="font-normal text-[var(--color-brand-400)]">(pick)</span></h4>
              <p className="mt-1 text-[12px] leading-[1.5] text-text-tertiary">Same SP chip, dashed inset outline + no fill. Keeps identity; dashed reads as &ldquo;not committed&rdquo;.</p>
            </div>
            <div className="rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
              <div className="mb-4 flex min-h-[2rem] items-center">
                <Chip s={MARKERS.sp.style} Icon={Hash} className="relative inline-flex">
                  5<Pencil size={9} strokeWidth={2} className="absolute -right-1 -top-1 text-text-muted" />
                </Chip>
              </div>
              <h4 className="text-[13px] font-semibold text-text-primary">C · Hash + pencil cue</h4>
              <p className="mt-1 text-[12px] leading-[1.5] text-text-tertiary">Keeps the chip, adds a tiny pencil corner. Most information, but busy at row size.</p>
            </div>
          </div>
        </section>

        {/* ===== SECTION 3 ===== */}
        <section className="mb-16">
          <SectionTitle n="3" title="All three in the real board" hint="Boxes · slate SP · violet BV" />
          <Card>
            <BoardHeader />
            {ROWS.map((row) => (
              <FauxRow key={row.key} row={row} refineMarker={<RefineMarker />} />
            ))}
          </Card>
          <p className="mt-3 text-[12px] leading-[1.6] text-text-muted">
            <LegendIcon s={REFINE_STYLE} Icon={Boxes} size={13} /> = in refinement (VPL-46101, 46304, 45948).{" "}
            <LegendIcon s={MARKERS.bv.style} Icon={TrendingUp} /> = BV, <LegendIcon s={MARKERS.sp.style} Icon={Hash} /> = SP.{" "}
            {draftRow.key} shows the penciled-SP dashed variant.
          </p>
        </section>

        {/* ===== SECTION 4 — status badges ===== */}
        <section className="mb-16">
          <SectionTitle n="4" title="Status badges" hint="now that violet = BV" />
          <p className="mb-5 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            Statuses <em>are</em> the right place for semantic colour (markers aren&apos;t). The trigger: <strong className="text-text-secondary">TEST was violet</strong>, and BV now takes violet — a collision. So TEST moves to <strong className="text-text-secondary">amber</strong> (freed up when BV left it). The set avoids all three marker hues (teal / slate / violet). Lifecycle runs cool&nbsp;→&nbsp;warm&nbsp;→&nbsp;success; the two exception states are muted + struck so they sit outside the flow.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="border-b border-border-subtle px-4 py-3">
                <h3 className="text-[14px] font-semibold text-text-primary">Header count pills</h3>
                <p className="mt-0.5 text-[12px] text-text-tertiary">Full colour: tinted fill + theme-aware text.</p>
              </div>
              <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {STATUSES.filter((s) => s.lane === "lifecycle").map((d) => <StatusCountPill key={d.key} d={d} />)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {STATUSES.filter((s) => s.lane === "exception").map((d) => <StatusCountPill key={d.key} d={d} />)}
                </div>
                <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
                  <span className="text-[11px] text-text-muted">no collision with BV:</span>
                  <StatusCountPill d={STATUSES[2]} />
                  <Chip s={MARKERS.bv.style} Icon={MARKERS.bv.Icon}>8</Chip>
                </div>
              </div>
            </Card>

            <Card>
              <div className="border-b border-border-subtle px-4 py-3">
                <h3 className="text-[14px] font-semibold text-text-primary">Row status pills</h3>
                <p className="mt-0.5 text-[12px] text-text-tertiary">Neutral text; colour carried by the dot (as on the real board).</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 p-4">
                {STATUSES.map((d) => <StatusRowPill key={d.key} d={d} />)}
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { k: "To do", v: "zinc — neutral, not started (cooler-neutral than the slate SP chip)" },
              { k: "In progress", v: "sky — active (not teal, which is the refinement marker)" },
              { k: "Test", v: "amber — in verification; warm contrast against In progress" },
              { k: "Done", v: "emerald — complete / success" },
              { k: "Deprecated", v: "muted zinc + strikethrough — retired, sits outside the flow" },
              { k: "Deleted", v: "muted rose + strikethrough — the derived removed-from-Jira state, not a Jira status" },
            ].map((r) => (
              <div key={r.k} className="rounded-xl bg-[var(--color-surface-floating)] px-3.5 py-3 ring-1 ring-border-default">
                <p className="text-[12px] font-semibold text-text-primary">{r.k}</p>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-text-tertiary">{r.v}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== SECTION 5 ===== */}
        <section className="mb-10">
          <SectionTitle n="5" title="Refinement badge treatments" hint="if the bare glyph is too quiet" />
          <p className="mb-5 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            If the bare teal glyph is too easy to miss, these make the refinement signal louder — all with the
            chosen <span className="text-[var(--color-brand-400)]">Boxes</span> glyph.
          </p>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BADGE_STYLES.map((b) => (
              <div key={b.id} className="flex flex-col gap-4 rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
                <div className="flex min-h-[2.25rem] items-center">{b.render(CHOSEN.Icon, "Refine")}</div>
                <div>
                  <h3 className="text-[13px] font-semibold text-text-primary">{b.name}</h3>
                  <p className="mt-1 text-[12px] leading-[1.55] text-text-tertiary">{b.note}</p>
                </div>
              </div>
            ))}
          </div>
          <Card>
            <BoardHeader />
            {BADGE_STYLES.map((b, i) => (
              <FauxRow key={b.id} row={{ ...ROWS[i % ROWS.length], refined: true }} refineMarker={b.render(CHOSEN.Icon, "Refine")} />
            ))}
          </Card>
          <p className="mt-3 text-[12px] leading-[1.6] text-text-muted">Each row uses a different badge style, so you can see which one your eye lands on first.</p>
        </section>
      </div>
    </div>
  );
}
