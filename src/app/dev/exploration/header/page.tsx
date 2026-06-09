"use client";

/**
 * Throwaway exploration: redesign of the fixed top header bar (today: ViewHeader.tsx).
 *
 * Direction decided with the PO: NO beeldmerk / logomark anywhere. The brand
 * carries entirely through the WORDMARK - the "bridge_" lettering, its teal
 * underscore (promoted here to a live console caret), the Space Mono type and
 * the teal accent. Cohesion comes from type + color, not a separate symbol.
 *
 * Two goals still drive every variant:
 *   1. POLISH THE BAR  - better grouping, surface and rhythm than today's flat row.
 *   2. PULL THE MENU IN - the nav lives in a floating bottom launcher today; each
 *      variant gives it a different, predictable home inside the fixed header.
 *
 * Each variant tags WHERE the menu went and HOW it leans on the wordmark/caret.
 * (Favicon is a separate task - parked for now, noted at the bottom.)
 * Reachable at /dev/exploration/header; not linked from app nav.
 */

import { useState } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  ArrowLeft,
  CalendarDays,
  Search,
  MoreHorizontal,
  Bell,
  ChevronDown,
  ChevronRight,
  Menu as MenuIcon,
  LayoutGrid,
  KanbanSquare,
  MessageCircle,
  NotebookPen,
  Gem,
  Zap,
  GitBranch,
  Users,
  Trash2,
  Sun,
  Moon,
} from "lucide-react";

/* ============================================================ shared bits == */

const GREEN = "#34d36a";

/**
 * The brand wordmark. The teal underscore can run as a blinking console caret
 * (`caret`) - that underscore is the one recurring brand signature now that the
 * beeldmerk is gone.
 */
function Wordmark({ size = 19, caret = false }: { size?: number; caret?: boolean }) {
  return (
    <span
      className="font-[family-name:var(--font-space-mono)] font-bold lowercase tracking-[-0.02em] text-text-primary"
      style={{ fontSize: size }}
    >
      bridge
      <span className={`text-[var(--color-brand-400)] ${caret ? "bridge-caret" : ""}`}>_</span>
    </span>
  );
}

/** Calendar + active sprint key + live dot - the view context cluster. */
function SprintContext() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CalendarDays className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.75} />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary">BT: 139</span>
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: GREEN, boxShadow: `0 0 7px ${GREEN}` }}
      />
    </div>
  );
}

/** SP / BV / # toggle + completion track + time track - the fullness meter. */
function FullnessMeter() {
  const seg = (label: string, on?: boolean) => (
    <span
      key={label}
      className={`grid h-5 place-items-center rounded-[6px] px-1.5 text-[11px] font-semibold tracking-tight transition-colors ${
        on ? "bg-overlay-strong text-text-primary" : "text-text-muted"
      }`}
    >
      {label}
    </span>
  );
  return (
    <div className="hidden items-center gap-3 lg:flex">
      <div className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
        {seg("SP", true)}
        {seg("BV")}
        {seg("#")}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative h-1 w-[130px] overflow-hidden rounded-full bg-overlay-default">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: "14%", background: "var(--color-brand-400)" }}
          />
        </div>
        <span className="text-[12px] tabular-nums text-text-tertiary">0%</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative h-1 w-[64px] overflow-hidden rounded-full bg-overlay-default">
          <div className="absolute inset-y-0 left-0 rounded-full bg-text-muted" style={{ width: "20%" }} />
        </div>
        <span className="text-[12px] tabular-nums text-text-muted">day 2/10</span>
      </div>
    </div>
  );
}

/** Right-side actions: bell (with 9+ badge), search, overflow. */
function RightActions({ flat }: { flat?: boolean }) {
  const btn =
    "group relative grid h-8 w-8 place-items-center rounded-lg cursor-pointer text-text-tertiary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";
  const wrap = flat ? "" : "rounded-xl bg-overlay-subtle p-0.5 ring-1 ring-border-default/60";
  return (
    <div className={`flex items-center gap-0.5 ${wrap}`}>
      <button className={btn} title="Notifications">
        <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
        <span
          className="absolute -right-0.5 -top-0.5 grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9px] font-bold text-white ring-2 ring-[var(--color-surface-chrome)]"
          style={{ background: "#ef4444" }}
        >
          9+
        </span>
      </button>
      <button className={btn} title="Search">
        <Search className="h-[17px] w-[17px]" strokeWidth={1.75} />
      </button>
      <button className={btn} title="More">
        <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- nav dropdown -- */

type NavItem = { label: string; icon: LucideIcon; meta?: string };
const PRIMARY: NavItem[] = [
  { label: "Sprint Board", icon: KanbanSquare, meta: "BT: 139" },
  { label: "Chat", icon: MessageCircle, meta: "34 unread" },
  { label: "Story Writer", icon: NotebookPen, meta: "8 drafts" },
  { label: "Refinement", icon: Gem, meta: "0 to refine" },
];
const MORE: NavItem[] = [
  { label: "Epics", icon: Zap },
  { label: "Pipelines", icon: GitBranch },
  { label: "Stakeholder", icon: Users },
  { label: "Cleanup", icon: Trash2 },
];

function Avatar({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white ring-1 ring-white/15"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: "linear-gradient(135deg, var(--color-brand-400), var(--color-brand-700))",
      }}
    >
      TB
    </span>
  );
}

/** A compact nav panel that drops out of the header. Anchored by the caller. */
function NavDropdown({ align = "left", onClose }: { align?: "left" | "right"; onClose: () => void }) {
  return (
    <>
      <button className="fixed inset-0 z-40 cursor-default" aria-hidden tabIndex={-1} onClick={onClose} />
      <div
        className={`absolute top-[calc(100%+10px)] z-50 w-[320px] overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65)] ring-1 ring-border-strong ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
        <div className="flex items-center gap-3 border-b border-border-default px-4 py-3.5">
          <Avatar />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-text-primary">Thijs van den Berg</p>
            <p className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
              Synced · just now
            </p>
          </div>
        </div>
        <ul className="p-1.5">
          {PRIMARY.map(({ label, icon: Icon, meta }) => (
            <li key={label}>
              <button className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-100 hover:bg-hover-list-item cursor-pointer">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-overlay-subtle text-[var(--color-brand-300)]">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </span>
                <span className="flex-1 text-[13px] font-medium text-text-primary">{label}</span>
                {meta && <span className="text-[11px] text-text-muted">{meta}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t border-border-default px-3 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">More</span>
          <div className="flex flex-1 items-center justify-end gap-1">
            {MORE.map(({ label, icon: Icon }) => (
              <button
                key={label}
                title={label}
                className="grid h-7 w-7 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-hover-list-item hover:text-text-secondary cursor-pointer"
              >
                <Icon className="h-[15px] w-[15px]" strokeWidth={1.5} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------- chrome frames -- */

/** Outer device-like frame that renders a bar plus a sliver of the views row. */
function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border-strong shadow-[0_24px_70px_-30px_rgba(0,0,0,0.7)]">
      {children}
      {/* faint hint of the views bar below, for context */}
      <div className="flex items-center gap-4 border-t border-border-default bg-[var(--color-surface-base)] px-5 py-2.5 opacity-55">
        <span className="text-[12px] font-semibold text-text-secondary">All</span>
        <span className="text-[12px] text-text-tertiary">Backlogs</span>
        <span className="border-b-2 border-[var(--color-brand-400)] pb-0.5 text-[12px] font-medium text-text-primary">
          BT: 139
        </span>
        <span className="text-[12px] text-text-tertiary">BT: 140</span>
        <span className="text-[12px] text-text-tertiary">Saved</span>
      </div>
    </div>
  );
}

/** The shared bar shell: gradients + chrome surface. Children fill the row. */
function Bar({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="relative flex items-center gap-0 bg-[var(--color-surface-chrome)] px-4 py-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
      {extra}
      {children}
    </div>
  );
}

function VDivider() {
  return <span className="mx-3.5 h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-border-strong to-transparent" />;
}

/* ================================================================ variants */

/* --- A. Wordmark Menu ----------------------------------------------------- */
/* The wordmark itself is the menu trigger - the brand mark and the nav button
   are the same element. A chevron fades in on hover; the underscore stays put. */
function VariantA() {
  const [open, setOpen] = useState(false);
  return (
    <Chrome>
      <Bar>
        <div className="relative shrink-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 cursor-pointer transition-colors duration-150 hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title="Open menu"
          >
            <Wordmark caret />
            <ChevronDown
              className="h-3.5 w-3.5 text-text-muted opacity-0 -translate-x-1 transition-[opacity,transform] duration-150 group-hover:opacity-100 group-hover:translate-x-0"
              strokeWidth={2}
            />
          </button>
          {open && <NavDropdown onClose={() => setOpen(false)} />}
        </div>
        <VDivider />
        <SprintContext />
        <div className="ml-auto flex items-center gap-4 pl-4">
          <FullnessMeter />
          <RightActions />
        </div>
      </Bar>
    </Chrome>
  );
}

/* --- B. Console Breadcrumb ------------------------------------------------ */
/* IDE/console-style path: bridge_ / Sprint Board / BT: 139. The first crumb is
   the menu dropdown. Mono separators + the caret make it feel like a terminal
   prompt - on-brand without any symbol. */
function VariantB() {
  const [open, setOpen] = useState(false);
  const sep = <span className="px-2 font-[family-name:var(--font-space-mono)] text-[14px] text-border-strong">/</span>;
  return (
    <Chrome>
      <Bar>
        <div className="relative flex min-w-0 items-center">
          <button
            onClick={() => setOpen((v) => !v)}
            className="group flex items-center gap-1 rounded-md px-1 py-0.5 cursor-pointer transition-colors hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title="Open menu"
          >
            <Wordmark size={16} caret />
            <ChevronDown className="h-3 w-3 text-text-muted" strokeWidth={2} />
          </button>
          {sep}
          <span className="text-[13px] font-medium text-text-secondary">Sprint Board</span>
          {sep}
          <span className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
            BT: 139
            <span className="h-[6px] w-[6px] rounded-full" style={{ background: GREEN, boxShadow: `0 0 6px ${GREEN}` }} />
          </span>
          {open && <NavDropdown onClose={() => setOpen(false)} />}
        </div>
        <div className="ml-auto flex items-center gap-4 pl-4">
          <FullnessMeter />
          <RightActions />
        </div>
      </Bar>
    </Chrome>
  );
}

/* --- C. Views Pill -------------------------------------------------------- */
/* Most discoverable: an explicit labeled pill right after the wordmark. A plain
   grid glyph (not a brand symbol) marks it; the caret keeps the brand present. */
function VariantC() {
  const [open, setOpen] = useState(false);
  return (
    <Chrome>
      <Bar>
        <Wordmark caret />
        <VDivider />
        <div className="relative shrink-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-overlay-subtle py-1.5 pl-2.5 pr-3 text-[13px] font-medium text-text-secondary ring-1 ring-border-default cursor-pointer transition-colors duration-150 hover:bg-hover-interactive hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <LayoutGrid className="h-4 w-4 text-[var(--color-brand-400)]" strokeWidth={1.75} />
            Views
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />
          </button>
          {open && <NavDropdown onClose={() => setOpen(false)} />}
        </div>
        <span className="mx-3.5 h-6 w-px shrink-0 bg-border-strong" />
        <SprintContext />
        <div className="ml-auto flex items-center gap-4 pl-4">
          <FullnessMeter />
          <RightActions />
        </div>
      </Bar>
    </Chrome>
  );
}

/* --- D. Avatar + brand baseline ------------------------------------------ */
/* Familiar SaaS pattern: account + nav live under the avatar on the right. The
   underscore is "stretched" into a thin teal baseline rule under the bar, so the
   brand signature spans the whole chrome instead of being a single glyph. */
function VariantD() {
  const [open, setOpen] = useState(false);
  return (
    <Chrome>
      <div className="relative">
        <Bar>
          <Wordmark caret />
          <VDivider />
          <SprintContext />
          <div className="ml-auto flex items-center gap-3 pl-4">
            <FullnessMeter />
            <RightActions flat />
            <span className="h-6 w-px bg-border-strong" />
            <div className="relative">
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 ring-1 ring-border-default cursor-pointer transition-colors hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                title="Account and menu"
              >
                <Avatar size={28} />
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />
              </button>
              {open && <NavDropdown align="right" onClose={() => setOpen(false)} />}
            </div>
          </div>
        </Bar>
        {/* the brand "underscore" stretched into a baseline */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]"
          style={{
            background:
              "linear-gradient(to right, var(--color-brand-400) 0%, var(--color-brand-500) 18%, transparent 42%)",
          }}
        />
      </div>
    </Chrome>
  );
}

/* --- E. Segmented Switcher ------------------------------------------------ */
/* A console-style view switcher: "All views" as a segmented control. Reads as a
   mission-control surface; the wordmark caret carries the brand. */
function VariantE() {
  const [open, setOpen] = useState(false);
  return (
    <Chrome>
      <Bar>
        <Wordmark caret />
        <VDivider />
        <div className="relative shrink-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="group flex items-center overflow-hidden rounded-lg ring-1 ring-border-default cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            title="Switch view"
          >
            <span className="grid h-7 place-items-center bg-overlay-subtle px-2 text-[var(--color-brand-300)] transition-colors group-hover:bg-hover-interactive">
              <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
            <span className="h-7 px-2.5 text-[12px] font-semibold leading-7 text-text-primary transition-colors group-hover:bg-hover-interactive">
              All views
            </span>
            <span className="grid h-7 place-items-center border-l border-border-default px-1.5 text-text-muted transition-colors group-hover:bg-hover-interactive">
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </button>
          {open && <NavDropdown onClose={() => setOpen(false)} />}
        </div>
        <span className="mx-3.5 h-6 w-px shrink-0 bg-border-strong" />
        <SprintContext />
        <div className="ml-auto flex items-center gap-4 pl-4">
          <FullnessMeter />
          <RightActions />
        </div>
      </Bar>
    </Chrome>
  );
}

/* --- F. Caret Command Bar ------------------------------------------------- */
/* The most resolved take. Wordmark = menu (as in A), but the left cluster -
   menu + sprint context - is grouped into one subtly brand-tinted "command"
   capsule with a left glow, so the bar reads as a single console unit. The
   blinking caret is the signature. A hamburger affordance is layered behind the
   wordmark for users who expect an explicit icon. */
function VariantF() {
  const [open, setOpen] = useState(false);
  return (
    <Chrome>
      <Bar
        extra={
          <div
            className="pointer-events-none absolute left-0 top-0 h-full w-80"
            style={{
              background:
                "radial-gradient(ellipse at left center, color-mix(in srgb, var(--color-brand-500) 14%, transparent) 0%, transparent 70%)",
            }}
          />
        }
      >
        <div className="relative flex items-center gap-3 rounded-xl bg-overlay-subtle py-1.5 pl-2 pr-3.5 ring-1 ring-border-default/70">
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="group flex items-center gap-2 rounded-lg px-1.5 py-1 cursor-pointer transition-colors duration-150 hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              title="Open menu"
            >
              <MenuIcon
                className="h-4 w-4 text-text-muted transition-colors group-hover:text-[var(--color-brand-300)]"
                strokeWidth={2}
              />
              <Wordmark caret />
            </button>
            {open && <NavDropdown onClose={() => setOpen(false)} />}
          </div>
          <span className="h-5 w-px bg-border-strong" />
          <SprintContext />
        </div>
        <div className="ml-auto flex items-center gap-4 pl-4">
          <FullnessMeter />
          <RightActions />
        </div>
      </Bar>
    </Chrome>
  );
}

/* ============================================================== page shell */

type Spec = {
  id: string;
  title: string;
  menu: string;
  brand: string;
  blurb: string;
  Render: () => React.ReactNode;
};

const VARIANTS: Spec[] = [
  {
    id: "A",
    title: "Wordmark Menu",
    menu: "Wordmark = menu",
    brand: "Caret underscore",
    blurb:
      "The wordmark itself opens the nav - brand mark and menu button are one element. A chevron fades in on hover. Minimal and obvious.",
    Render: VariantA,
  },
  {
    id: "B",
    title: "Console Breadcrumb",
    menu: "First crumb = menu",
    brand: "Mono path + caret",
    blurb:
      "An IDE-style path: bridge_ / Sprint Board / BT: 139. The first crumb is the menu. Mono separators and the caret make it read like a terminal prompt - on brand with no symbol.",
    Render: VariantB,
  },
  {
    id: "C",
    title: "Views Pill",
    menu: "Labeled 'Views' pill",
    brand: "Caret underscore",
    blurb:
      "The most discoverable option: an explicit labeled pill right after the wordmark. A plain grid glyph marks it (not a brand symbol); the caret keeps the brand present.",
    Render: VariantC,
  },
  {
    id: "D",
    title: "Avatar + brand baseline",
    menu: "Avatar (right)",
    brand: "Underscore stretched to a baseline",
    blurb:
      "Familiar SaaS pattern - account + nav under the avatar on the right. The underscore is stretched into a thin teal baseline rule, so the brand signature spans the whole bar.",
    Render: VariantD,
  },
  {
    id: "E",
    title: "Segmented Switcher",
    menu: "'All views' segmented control",
    brand: "Caret underscore",
    blurb:
      "A console-style view switcher rendered as a segmented control. Reads as a mission-control surface; the wordmark caret carries the brand.",
    Render: VariantE,
  },
  {
    id: "F",
    title: "Caret Command Bar",
    menu: "Wordmark = menu (with icon)",
    brand: "Brand-tinted capsule + caret",
    blurb:
      "The most resolved take. Wordmark = menu, but the left cluster (menu + sprint context) is grouped into one brand-tinted capsule with a left glow, so the bar reads as a single console unit. A hamburger sits before the wordmark for users who expect an explicit icon.",
    Render: VariantF,
  },
];

function Tag({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-overlay-subtle px-2.5 py-1 ring-1 ring-border-default">
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</span>
      <span className={`text-[11px] font-medium ${accent ? "text-[var(--color-brand-300)]" : "text-text-secondary"}`}>
        {value}
      </span>
    </span>
  );
}

export default function HeaderExplorationPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div data-theme={theme} className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      {/* the caret blink - opacity only, on-brand console signature */}
      <style>{`@keyframes bridge-blink { 0%, 55% { opacity: 1 } 60%, 95% { opacity: 0.25 } 100% { opacity: 1 } }
        .bridge-caret { animation: bridge-blink 1.5s steps(1, end) infinite; }`}</style>

      <div className="mx-auto max-w-[1080px]">
        {/* page header */}
        <header className="mb-9">
          <div className="mb-5 flex items-center justify-between">
            <Link
              href="/dev/exploration"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              All explorations
            </Link>
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="inline-flex items-center gap-2 rounded-full bg-overlay-subtle px-3 py-1.5 text-[12px] font-medium text-text-secondary ring-1 ring-border-default cursor-pointer transition-colors hover:bg-hover-interactive hover:text-text-primary"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />}
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/header
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Top bar - wordmark &amp; menu
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            No beeldmerk. The brand carries entirely through the <span className="font-[family-name:var(--font-space-mono)] font-bold">bridge<span className="text-[var(--color-brand-400)]">_</span></span> wordmark - its teal underscore promoted to a live caret, plus mono type and the teal accent. Six directions, each also pulling the nav menu out of the floating launcher into the bar. Menu triggers are live - click them. Toggle light/dark above.
          </p>
        </header>

        {/* current reference */}
        <section className="mb-10">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <span className="h-px w-6 bg-border-strong" /> Today
          </p>
          <Chrome>
            <Bar>
              <Wordmark />
              <VDivider />
              <SprintContext />
              <div className="ml-auto flex items-center gap-4 pl-4">
                <FullnessMeter />
                <RightActions flat />
              </div>
            </Bar>
          </Chrome>
          <p className="mt-2.5 text-body-sm leading-[1.6] text-text-tertiary">
            A static wordmark stands alone and the nav is hidden in a floating launcher (not in this bar at all).
          </p>
        </section>

        {/* variants */}
        <div className="space-y-12">
          {VARIANTS.map(({ id, title, menu, brand, blurb, Render }) => (
            <section key={id}>
              <div className="mb-3.5 flex flex-wrap items-center gap-3">
                <span
                  className="grid h-7 w-7 place-items-center rounded-lg text-[12px] font-bold text-[var(--color-brand-200)]"
                  style={{ background: "color-mix(in srgb, var(--color-brand-500) 18%, transparent)" }}
                >
                  {id}
                </span>
                <h2 className="font-display text-[19px] font-semibold tracking-[-0.02em] text-text-primary">{title}</h2>
                <Tag label="Menu" value={menu} accent />
                <Tag label="Brand" value={brand} />
              </div>
              <Render />
              <p className="mt-3 max-w-3xl text-body-sm leading-[1.65] text-text-tertiary">{blurb}</p>
            </section>
          ))}
        </div>

        <footer className="mt-14 space-y-2 border-t border-border-default pt-5">
          <p className="flex items-center gap-2 text-[12px] text-text-muted">
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            Pick a direction (or a hybrid) and I&apos;ll wire the chosen menu home into the real ViewHeader.
          </p>
          <p className="flex items-center gap-2 text-[12px] text-text-muted">
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            Favicon still needs a mark of its own (the wordmark won&apos;t shrink to 16px) - parked as a separate task.
          </p>
        </footer>
      </div>
    </div>
  );
}
