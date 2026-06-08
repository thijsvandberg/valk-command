"use client";

/**
 * TEMPORARY exploration page for sidebar redesign concepts.
 * Five navigation concepts shown over a faux board backdrop so each can be judged
 * in context. Reach it via the exploration hub at /dev/exploration (or directly
 * at /dev/exploration/sidebar). Not linked from the app nav.
 * The Bento launcher (variant A4) shipped as the real sidebar in BRDG-317; this
 * page is kept under /dev/exploration as a reference for future nav explorations.
 *
 * The "Bento launcher" concept is the front-runner (vertical-stack shell). Its
 * sub-tabs A1-A4 explore how the CONTENT inside the panel is presented; the
 * Spotlight (C) tab is parked there as a possible future direction.
 *
 * Priority model used across all concepts:
 *   PRIMARY  Sprint Board (by far the most used)
 *   COMMON   Chat, Story Writer, Refinement
 *   RARE     Epics, Pipelines, Stakeholder, Cleanup (demoted / tucked away)
 */

import { useState } from "react";
import {
  MessageCircle,
  KanbanSquare,
  GitBranch,
  Gem,
  Zap,
  NotebookPen,
  Users,
  Trash2,
  Search,
  Command,
  Plus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  LayoutGrid,
  Moon,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";

type NavItem = {
  label: string;
  icon: React.ReactNode;
  tier: "primary" | "common" | "rare";
};

const ICON = "h-[18px] w-[18px]";

const NAV: NavItem[] = [
  { label: "Sprint Board", icon: <KanbanSquare className={ICON} strokeWidth={1.5} />, tier: "primary" },
  { label: "Chat", icon: <MessageCircle className={ICON} strokeWidth={1.5} />, tier: "common" },
  { label: "Story Writer", icon: <NotebookPen className={ICON} strokeWidth={1.5} />, tier: "common" },
  { label: "Refinement", icon: <Gem className={ICON} strokeWidth={1.5} />, tier: "common" },
  { label: "Epics", icon: <Zap className={ICON} strokeWidth={1.5} />, tier: "rare" },
  { label: "Pipelines", icon: <GitBranch className={ICON} strokeWidth={1.5} />, tier: "rare" },
  { label: "Stakeholder", icon: <Users className={ICON} strokeWidth={1.5} />, tier: "rare" },
  { label: "Cleanup", icon: <Trash2 className={ICON} strokeWidth={1.5} />, tier: "rare" },
];

const PRIMARY = NAV.find((n) => n.tier === "primary")!;
const COMMON = NAV.filter((n) => n.tier === "common");
const RARE = NAV.filter((n) => n.tier === "rare");

/* ------------------------------------------------------------------ */
/* Faux board backdrop — gives each concept a realistic context.       */
/* ------------------------------------------------------------------ */

const FAUX_ROWS = [
  ["VPL-29223", "Monitoring Kibana (PROD) & heartbeat channel", "Logging & metrics"],
  ["VPL-46101", "Display strikethrough (original) price per rate in room results", "BT: Rooms"],
  ["VPL-45476", "Update shiji open api specs - sprint 139", ""],
  ["VPL-45991", "Auto select correct hotel for BT based on hotel domain", ""],
  ["VPL-46304", "Research Valk Loyal SOAP security", "Tech: Security"],
  ["VPL-42510", "[Initial-sync] Implement initial restrictions sync", "ARIE"],
  ["VPL-45948", "Add and remove group codes manually in the bookingtool", "Group Reservations"],
  ["VPL-45943", "Restrict booking calendar to group dates", "Group Reservations"],
  ["VPL-36166", "Configurable maximum booking period per hotel", "BT: Dates"],
  ["VPL-45944", "Display group code in sidebar and summary during booking flow", "Group Reservations"],
];

function FauxBoard() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* top chrome */}
      <div className="flex h-[52px] items-center gap-3 border-b border-border-default px-5">
        <span className="font-mono text-body-sm text-text-secondary">BT: 139</span>
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
        <div className="ml-2 flex gap-1.5">
          {["SP", "BV", "#"].map((t) => (
            <span key={t} className="rounded bg-overlay-default px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
              {t}
            </span>
          ))}
        </div>
        <div className="ml-3 h-1.5 w-44 overflow-hidden rounded-full bg-overlay-default">
          <div className="h-full w-[6%] bg-[var(--color-brand-500)]" />
        </div>
      </div>
      {/* filter row */}
      <div className="flex h-11 items-center gap-2 border-b border-border-subtle px-5">
        {["Status", "Epic", "Assignee", "Readiness", "Type", "Team"].map((f) => (
          <span key={f} className="rounded-md border border-border-default px-2 py-1 text-[11px] text-text-tertiary">
            {f}
          </span>
        ))}
      </div>
      {/* rows */}
      <div className="px-2 py-1">
        {FAUX_ROWS.map(([key, title, tag]) => (
          <div key={key} className="flex items-center gap-2.5 rounded-md px-3 py-2.5 hover:bg-hover-list-item">
            <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-border-strong" />
            <span className="font-mono text-body-sm text-text-tertiary">{key}</span>
            <span className="rounded bg-overlay-default px-1.5 py-0.5 font-mono text-[10px] text-text-muted">TODO</span>
            <span className="min-w-0 flex-1 truncate text-body-lg text-text-primary">{title}</span>
            {tag && (
              <span className="shrink-0 rounded-full border border-border-default px-2 py-0.5 text-[11px] text-text-tertiary">
                {tag}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Avatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-brand-700)] text-[11px] font-semibold text-white shadow-[0_2px_8px_var(--color-brand-glow)]"
      style={{ height: size, width: size }}
    >
      TV
    </div>
  );
}

/* ================================================================== */
/* CONCEPT 1 — Floating glass dock                                     */
/* ================================================================== */

function ConceptFloatingDock() {
  const [active, setActive] = useState("Sprint Board");
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <Stage>
      <FauxBoard />
      {/* dim board content slightly so the dock reads as floating chrome */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-black/30 to-transparent" />

      {/* avatar capsule, floating top-left */}
      <button className="absolute left-5 top-5 z-20 grid place-items-center rounded-full bg-[var(--color-surface-floating)]/80 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)] ring-1 ring-border-strong backdrop-blur-xl transition-transform duration-200 hover:scale-105 active:scale-95">
        <Avatar size={34} />
      </button>

      {/* the dock */}
      <nav className="absolute left-5 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2 rounded-[22px] bg-[var(--color-surface-floating)]/70 p-2 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7),0_0_0_1px_var(--color-border-strong),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
        {/* primary hero tile */}
        <DockItem
          item={PRIMARY}
          active={active === PRIMARY.label}
          hero
          onClick={() => setActive(PRIMARY.label)}
        />
        <span className="my-0.5 h-px w-7 bg-border-strong" />
        {COMMON.map((it) => (
          <DockItem key={it.label} item={it} active={active === it.label} onClick={() => setActive(it.label)} />
        ))}
        <span className="my-0.5 h-px w-7 bg-border-strong" />
        {/* rare items tucked behind a "more" disc that expands upward-ish */}
        <div className="relative">
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`grid h-11 w-11 place-items-center rounded-2xl transition-colors duration-150 ${
              moreOpen ? "bg-overlay-strong text-text-primary" : "text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
            }`}
            title="More"
          >
            <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
          {moreOpen && (
            <div className="absolute left-[calc(100%+12px)] top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-2xl bg-[var(--color-surface-floating)]/90 p-1.5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7),0_0_0_1px_var(--color-border-strong)] backdrop-blur-2xl">
              {RARE.map((it) => (
                <button
                  key={it.label}
                  onClick={() => { setActive(it.label); setMoreOpen(false); }}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-body-sm text-text-secondary transition-colors duration-150 hover:bg-hover-list-item hover:text-text-primary"
                >
                  <span className="text-text-tertiary">{it.icon}</span>
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>
    </Stage>
  );
}

function DockItem({
  item,
  active,
  hero = false,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  hero?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`grid place-items-center rounded-2xl transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.08] active:scale-95 ${
          hero ? "h-12 w-12" : "h-11 w-11"
        } ${
          active && hero
            ? "bg-[var(--color-brand-500)] text-white shadow-[0_6px_20px_var(--color-brand-glow)]"
            : active
              ? "bg-[var(--color-brand-600)]/20 text-[var(--color-brand-300)]"
              : "text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
        }`}
      >
        {item.icon}
      </button>
      {/* label tooltip on hover */}
      <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg bg-[var(--color-surface-floating)] px-2.5 py-1 text-body-sm text-text-secondary opacity-0 shadow-popover ring-1 ring-border-strong transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100">
        {item.label}
      </span>
    </div>
  );
}

/* ================================================================== */
/* CONCEPT 2 — Hover-expand rail with tiers                            */
/* ================================================================== */

function RailRow({
  item,
  active,
  expanded,
  big = false,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
  big?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-2.5 transition-colors duration-150 ${
        big ? "py-3" : "py-2"
      } ${
        active
          ? "bg-[var(--color-brand-600)]/15 text-[var(--color-brand-200)]"
          : "text-text-tertiary hover:bg-hover-list-item hover:text-text-primary"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-[var(--color-brand-400)]" : ""}`}>{item.icon}</span>
      <span
        className={`overflow-hidden whitespace-nowrap text-body-sm transition-all duration-200 ${
          expanded ? "w-32 opacity-100" : "w-0 opacity-0"
        } ${big ? "font-semibold" : ""}`}
      >
        {item.label}
      </span>
    </button>
  );
}

function ConceptHoverRail() {
  const [active, setActive] = useState("Sprint Board");
  const [expanded, setExpanded] = useState(false);

  return (
    <Stage>
      <div className="absolute inset-0 left-[64px]">
        <FauxBoard />
      </div>
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={`absolute inset-y-0 left-0 z-20 flex flex-col gap-1 border-r border-border-default bg-[var(--color-surface-chrome)] px-2.5 py-4 transition-[width] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          expanded ? "w-52 shadow-[8px_0_40px_-8px_rgba(0,0,0,0.6)]" : "w-16"
        }`}
      >
        {/* profile moved to TOP */}
        <button className="mb-2 flex items-center gap-3 rounded-xl px-1.5 py-1.5 hover:bg-hover-list-item">
          <Avatar size={30} />
          <span className={`overflow-hidden whitespace-nowrap text-body-sm text-text-secondary transition-all duration-200 ${expanded ? "w-32 opacity-100" : "w-0 opacity-0"}`}>
            Thijs
          </span>
        </button>

        <RailRow item={PRIMARY} active={active === PRIMARY.label} expanded={expanded} big onClick={() => setActive(PRIMARY.label)} />

        <span className="my-1.5 ml-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          <span className={expanded ? "opacity-100" : "opacity-0"}>Workspace</span>
        </span>
        {COMMON.map((it) => <RailRow key={it.label} item={it} active={active === it.label} expanded={expanded} onClick={() => setActive(it.label)} />)}

        <div className="mt-auto">
          <span className="my-1.5 ml-2.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            <span className={expanded ? "opacity-100" : "opacity-0"}>Rarely used</span>
          </span>
          <div className={`flex flex-col gap-1 ${expanded ? "" : "opacity-50"}`}>
            {RARE.map((it) => <RailRow key={it.label} item={it} active={active === it.label} expanded={expanded} onClick={() => setActive(it.label)} />)}
          </div>
        </div>
      </aside>
    </Stage>
  );
}

/* ================================================================== */
/* CONCEPT 3 — Top command bar + ⌘K palette (no left rail)             */
/* ================================================================== */

function ConceptTopBar() {
  const [active, setActive] = useState("Sprint Board");
  const [palette, setPalette] = useState(false);

  return (
    <Stage>
      <div className="absolute inset-0 top-[56px]">
        <div className="relative h-full">
          {/* board without its own top chrome here */}
          <div className="px-2 py-1">
            {FAUX_ROWS.map(([key, title, tag]) => (
              <div key={key} className="flex items-center gap-2.5 rounded-md px-3 py-2.5 hover:bg-hover-list-item">
                <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-border-strong" />
                <span className="font-mono text-body-sm text-text-tertiary">{key}</span>
                <span className="rounded bg-overlay-default px-1.5 py-0.5 font-mono text-[10px] text-text-muted">TODO</span>
                <span className="min-w-0 flex-1 truncate text-body-lg text-text-primary">{title}</span>
                {tag && <span className="shrink-0 rounded-full border border-border-default px-2 py-0.5 text-[11px] text-text-tertiary">{tag}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-4 border-b border-border-default bg-[var(--color-surface-chrome)]/90 px-5 backdrop-blur-xl">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-brand-500)] text-white shadow-[0_2px_10px_var(--color-brand-glow)]">
          <KanbanSquare className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-text-primary">Bridge</span>

        {/* segmented primary + common */}
        <nav className="ml-3 flex items-center gap-1 rounded-xl bg-overlay-default p-1">
          {[PRIMARY, ...COMMON].map((it) => {
            const isActive = active === it.label;
            return (
              <button
                key={it.label}
                onClick={() => setActive(it.label)}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-body-sm transition-colors duration-150 ${
                  isActive
                    ? "bg-[var(--color-surface-floating)] font-medium text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <span className={isActive ? "text-[var(--color-brand-400)]" : ""}>{it.icon}</span>
                {it.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* everything rare lives in the command palette */}
          <button
            onClick={() => setPalette(true)}
            className="flex items-center gap-2 rounded-lg border border-border-default px-3 py-1.5 text-body-sm text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary"
          >
            <Search className="h-4 w-4" strokeWidth={1.5} />
            <span>Jump to…</span>
            <span className="flex items-center gap-0.5 rounded bg-overlay-default px-1.5 py-0.5 text-[10px] text-text-muted">
              <Command className="h-3 w-3" />K
            </span>
          </button>
          <Avatar />
        </div>
      </header>

      {palette && (
        <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/50 pt-28 backdrop-blur-sm" onClick={() => setPalette(false)}>
          <div className="w-[480px] overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_var(--color-border-strong)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
              <Search className="h-4 w-4 text-text-tertiary" strokeWidth={1.5} />
              <input autoFocus placeholder="Search views, tickets, actions…" className="flex-1 bg-transparent text-body-lg text-text-primary outline-none placeholder:text-text-muted" />
            </div>
            <div className="p-2">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Views</p>
              {NAV.map((it) => (
                <button key={it.label} onClick={() => { setActive(it.label); setPalette(false); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body-sm text-text-secondary hover:bg-hover-list-item hover:text-text-primary">
                  <span className="text-text-tertiary">{it.icon}</span>
                  {it.label}
                  {it.tier === "rare" && <span className="ml-auto text-[10px] text-text-muted">rarely used</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ================================================================== */
/* CONCEPT 4 — Radial fan-out FAB (bottom-left)                        */
/* ================================================================== */

function ConceptRadialFab() {
  const [active, setActive] = useState("Sprint Board");
  const [open, setOpen] = useState(false);

  const items = [PRIMARY, ...COMMON, ...RARE];
  // fan items along a quarter arc up-and-right from the FAB
  const radius = 132;
  const startDeg = -88;
  const endDeg = -2;

  return (
    <Stage>
      <FauxBoard />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-transparent" style={{ opacity: open ? 1 : 0, transition: "opacity 200ms" }} />

      <div className="absolute bottom-7 left-7 z-20">
        {items.map((it, i) => {
          const t = items.length === 1 ? 0 : i / (items.length - 1);
          const deg = startDeg + t * (endDeg - startDeg);
          const rad = (deg * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          const isActive = active === it.label;
          return (
            <button
              key={it.label}
              onClick={() => { setActive(it.label); setOpen(false); }}
              title={it.label}
              className={`group absolute bottom-0 left-0 grid h-12 w-12 place-items-center rounded-full shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)] ring-1 ring-border-strong backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                isActive ? "bg-[var(--color-brand-500)] text-white" : "bg-[var(--color-surface-floating)]/90 text-text-secondary hover:text-text-primary"
              }`}
              style={{
                transform: open ? `translate(${x}px, ${y}px)` : "translate(0,0)",
                opacity: open ? 1 : 0,
                pointerEvents: open ? "auto" : "none",
                transitionDelay: open ? `${i * 28}ms` : "0ms",
              }}
            >
              {it.icon}
              <span className="pointer-events-none absolute bottom-[calc(100%+6px)] whitespace-nowrap rounded-md bg-[var(--color-surface-floating)] px-2 py-0.5 text-[11px] text-text-secondary opacity-0 shadow-popover transition-opacity group-hover:opacity-100">
                {it.label}
              </span>
            </button>
          );
        })}

        {/* the FAB itself */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative grid h-14 w-14 place-items-center rounded-full bg-[var(--color-brand-500)] text-white shadow-[0_10px_30px_-4px_var(--color-brand-glow),0_0_0_1px_rgba(255,255,255,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-105 active:scale-95"
          style={{ transform: open ? "rotate(135deg)" : "rotate(0)" }}
        >
          <Plus className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>

      {/* profile pinned top-right in this concept */}
      <button className="absolute right-6 top-6 z-20 transition-transform hover:scale-105 active:scale-95">
        <Avatar size={36} />
      </button>
    </Stage>
  );
}

/* ================================================================== */
/* CONCEPT 5 — Bento launcher (front-runner)                           */
/* ================================================================== */

const COMMON_META: Record<string, string> = {
  Chat: "3 active",
  "Story Writer": "2 drafts",
  Refinement: "8 to refine",
};

const COMMON_INFO: Record<string, { count: string; note: string }> = {
  Chat: { count: "3", note: "active threads" },
  "Story Writer": { count: "2", note: "open drafts" },
  Refinement: { count: "8", note: "to refine" },
};

const ACCOUNT_ITEMS = [
  { label: "Theme", icon: <Moon className="h-[18px] w-[18px]" strokeWidth={1.5} />, value: "Light" },
  { label: "Notifications", icon: <Bell className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { label: "Keyboard shortcuts", icon: <Command className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
  { label: "Settings", icon: <Settings className="h-[18px] w-[18px]" strokeWidth={1.5} /> },
];

const PANEL_SHADOW =
  "shadow-[0_40px_90px_-24px_rgba(0,0,0,0.85),0_0_0_1px_var(--color-border-strong),inset_0_1px_0_rgba(255,255,255,0.06)]";

// staggered reveal: each child eases in once `open`, ordered top-to-bottom
const revealStyle = (open: boolean, i: number): React.CSSProperties => ({
  opacity: open ? 1 : 0,
  transform: open ? "translateY(0)" : "translateY(8px)",
  transition: "opacity 260ms ease, transform 260ms cubic-bezier(0.34,1.56,0.64,1)",
  transitionDelay: open ? `${60 + i * 45}ms` : "0ms",
});

type BodyCtx = { active: string; setActive: (s: string) => void; open: boolean; close: () => void };

function HeroStats() {
  return (
    <>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="rounded-md bg-overlay-default px-1.5 py-0.5 text-[10px] text-text-tertiary">14 to do</span>
        <span className="rounded-md bg-[var(--color-status-progress-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--color-status-progress)]">3 in prog</span>
        <span className="rounded-md bg-[var(--color-status-done-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--color-status-done)]">2 done</span>
      </div>
      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-overlay-strong">
        <div className="h-full rounded-full bg-[var(--color-brand-400)]" style={{ width: "10%" }} />
      </div>
    </>
  );
}

function AccountView({ open, baseIndex = 1 }: { open: boolean; baseIndex?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      {ACCOUNT_ITEMS.map((it, i) => (
        <button
          key={it.label}
          style={revealStyle(open, baseIndex + i)}
          className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-body-sm text-text-secondary transition-colors duration-150 hover:bg-hover-list-item hover:text-text-primary"
        >
          <span className="text-text-tertiary">{it.icon}</span>
          {it.label}
          {it.value && <span className="ml-auto text-[12px] text-text-muted">{it.value}</span>}
        </button>
      ))}
      <div className="my-1 h-px bg-border-subtle" />
      <button
        style={revealStyle(open, baseIndex + ACCOUNT_ITEMS.length)}
        className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-body-sm text-[var(--color-status-error)] transition-colors duration-150 hover:bg-[var(--color-status-error-subtle)]"
      >
        <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
        Sign out
      </button>
    </div>
  );
}

function AvatarToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Account"
      className={`grid place-items-center rounded-full p-0.5 ring-1 transition-colors ${
        active ? "ring-[var(--color-brand-500)]" : "ring-transparent hover:ring-border-strong"
      }`}
    >
      <Avatar size={30} />
    </button>
  );
}

function Backdrop({ open, onClose, strong = false }: { open: boolean; onClose: () => void; strong?: boolean }) {
  return (
    <div
      className={`absolute inset-0 ${strong ? "bg-black/60 backdrop-blur-md" : "bg-black/50 backdrop-blur-[2px]"} transition-opacity duration-200`}
      style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      onClick={onClose}
    />
  );
}

function CornerLauncher({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open navigation"
      className="absolute bottom-6 left-6 z-30 grid h-11 w-11 place-items-center rounded-2xl bg-[var(--color-surface-floating)]/90 text-[var(--color-brand-300)] shadow-[0_10px_30px_-6px_rgba(0,0,0,0.6)] ring-1 ring-border-strong backdrop-blur-xl transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.06] hover:text-[var(--color-brand-200)] active:scale-95"
      style={{ transform: open ? "scale(0.85)" : "scale(1)", opacity: open ? 0.5 : 1 }}
    >
      <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </button>
  );
}

/* ---- The shared A shell: icon launcher → vertical panel with profile + account flip.
        The body (how the nav content looks) is swapped per variation A1-A4. ---- */
function StackShell({
  width = 360,
  renderBody,
}: {
  width?: number;
  renderBody: (ctx: BodyCtx) => React.ReactNode;
}) {
  const [active, setActive] = useState("Sprint Board");
  const [open, setOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <Stage>
      <FauxBoard />
      <Backdrop open={open} onClose={() => setOpen(false)} />
      <CornerLauncher open={open} onClick={() => { setAccountOpen(false); setOpen((v) => !v); }} />

      <div
        className={`absolute bottom-6 left-6 z-30 origin-bottom-left overflow-hidden rounded-[26px] bg-[var(--color-surface-floating)]/95 ${PANEL_SHADOW} backdrop-blur-2xl transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]`}
        style={{ width, opacity: open ? 1 : 0, transform: open ? "scale(1) translateY(0)" : "scale(0.9) translateY(16px)", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[var(--color-brand-500)]/20 blur-3xl" />
        <div className="relative p-3">
          <button
            onClick={() => setAccountOpen((v) => !v)}
            style={revealStyle(open, 0)}
            className={`mb-3 flex w-full items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left transition-colors duration-150 ${accountOpen ? "bg-overlay-default" : "hover:bg-hover-list-item"}`}
          >
            <Avatar size={34} />
            <div className="leading-tight">
              <p className="text-body-sm font-medium text-text-primary">Thijs van den Berg</p>
              <p className="text-[11px] text-text-tertiary">thijs@newstory.nl</p>
            </div>
            <ChevronDown className={`ml-auto h-4 w-4 text-text-tertiary transition-transform duration-200 ${accountOpen ? "rotate-180" : ""}`} strokeWidth={1.5} />
          </button>

          {accountOpen
            ? <AccountView open={open} />
            : renderBody({ active, setActive, open, close: () => setOpen(false) })}
        </div>
      </div>
    </Stage>
  );
}

function StandardHero({ open, idx, onPick }: { open: boolean; idx: number; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      style={revealStyle(open, idx)}
      className="group relative mb-2.5 flex w-full items-stretch gap-3.5 overflow-hidden rounded-[20px] bg-gradient-to-br from-[var(--color-brand-600)]/35 via-[var(--color-brand-800)]/25 to-[var(--color-brand-950)]/10 p-4 text-left ring-1 ring-[var(--color-brand-600)]/35 transition-transform duration-200 hover:scale-[1.015]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center self-center rounded-2xl bg-[var(--color-brand-500)] text-white shadow-[0_6px_20px_var(--color-brand-glow)]">
        <KanbanSquare className="h-[22px] w-[22px]" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-body-lg font-semibold tracking-[-0.01em] text-text-primary">Sprint Board</p>
          <span className="rounded-md bg-[var(--color-brand-600)]/25 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-brand-200)]">BT: 139</span>
        </div>
        <HeroStats />
      </div>
      <ChevronRight className="absolute right-3.5 top-3.5 h-5 w-5 text-text-tertiary transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text-secondary" strokeWidth={1.5} />
    </button>
  );
}

function RareChips({ open, idx, onPick }: { open: boolean; idx: number; onPick: (label: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border-subtle px-1 pb-1 pt-3" style={revealStyle(open, idx)}>
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">More</span>
      {RARE.map((it) => (
        <button
          key={it.label}
          onClick={() => onPick(it.label)}
          className="rounded-full bg-overlay-default px-2.5 py-1 text-[11px] text-text-tertiary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---- A1: soft tiles — refined version of the current grid ---- */
function BodySoftTiles({ active, setActive, open, close }: BodyCtx) {
  const pick = (l: string) => { setActive(l); close(); };
  return (
    <>
      <StandardHero open={open} idx={1} onPick={() => pick("Sprint Board")} />
      <div className="grid grid-cols-3 gap-2.5" style={revealStyle(open, 2)}>
        {COMMON.map((it) => {
          const on = active === it.label;
          const info = COMMON_INFO[it.label];
          return (
            <button
              key={it.label}
              onClick={() => pick(it.label)}
              className={`group relative flex flex-col gap-3 overflow-hidden rounded-[18px] p-3.5 text-left transition-transform duration-200 hover:scale-[1.04] ${on ? "bg-[var(--color-brand-600)]/20 ring-1 ring-[var(--color-brand-600)]/45" : "bg-overlay-default ring-1 ring-transparent hover:bg-hover-interactive hover:ring-border-strong"}`}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <div className="flex items-center justify-between">
                <span className={`grid h-9 w-9 place-items-center rounded-xl transition-colors ${on ? "bg-[var(--color-brand-500)]/25 text-[var(--color-brand-200)]" : "bg-overlay-strong text-text-secondary group-hover:text-text-primary"}`}>
                  {it.icon}
                </span>
                <span className={`text-[15px] font-semibold tabular-nums ${on ? "text-[var(--color-brand-200)]" : "text-text-secondary"}`}>{info.count}</span>
              </div>
              <div>
                <p className="text-[12px] font-medium leading-tight text-text-primary">{it.label}</p>
                <p className="mt-0.5 text-[10px] text-text-muted">{info.note}</p>
              </div>
            </button>
          );
        })}
      </div>
      <RareChips open={open} idx={3} onPick={pick} />
    </>
  );
}

/* ---- A2: list rows — elegant scannable list instead of boxes ---- */
function BodyList({ active, setActive, open, close }: BodyCtx) {
  const pick = (l: string) => { setActive(l); close(); };
  return (
    <>
      <StandardHero open={open} idx={1} onPick={() => pick("Sprint Board")} />
      <div className="flex flex-col gap-0.5" style={revealStyle(open, 2)}>
        {COMMON.map((it) => {
          const on = active === it.label;
          const info = COMMON_INFO[it.label];
          return (
            <button
              key={it.label}
              onClick={() => pick(it.label)}
              className={`group flex items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-150 ${on ? "bg-[var(--color-brand-600)]/18" : "hover:bg-hover-list-item"}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors ${on ? "bg-[var(--color-brand-500)]/25 text-[var(--color-brand-200)]" : "bg-overlay-default text-text-secondary group-hover:text-text-primary"}`}>
                {it.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium text-text-primary">{it.label}</span>
                <span className="block text-[11px] text-text-muted">{info.note}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${on ? "bg-[var(--color-brand-500)]/25 text-[var(--color-brand-200)]" : "bg-overlay-default text-text-secondary"}`}>{info.count}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
            </button>
          );
        })}
      </div>
      <RareChips open={open} idx={3} onPick={pick} />
    </>
  );
}

/* ---- A3: stat dashboard — hero leads with big numbers + segmented bar ---- */
function BodyStat({ active, setActive, open, close }: BodyCtx) {
  const pick = (l: string) => { setActive(l); close(); };
  return (
    <>
      <button
        onClick={() => pick("Sprint Board")}
        style={revealStyle(open, 1)}
        className="group relative mb-2.5 block w-full overflow-hidden rounded-[20px] bg-gradient-to-br from-[var(--color-brand-600)]/35 via-[var(--color-brand-800)]/25 to-[var(--color-brand-950)]/10 p-4 text-left ring-1 ring-[var(--color-brand-600)]/35 transition-transform duration-200 hover:scale-[1.01]"
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--color-brand-500)] text-white shadow-[0_6px_20px_var(--color-brand-glow)]">
            <KanbanSquare className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <p className="text-body-lg font-semibold text-text-primary">Sprint Board</p>
          <span className="rounded-md bg-[var(--color-brand-600)]/25 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-brand-200)]">BT: 139</span>
          <ChevronRight className="ml-auto h-5 w-5 text-text-tertiary transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-overlay-default px-3 py-2">
            <p className="font-display text-[20px] font-semibold leading-none text-text-primary">14</p>
            <p className="mt-1 text-[10px] text-text-tertiary">To do</p>
          </div>
          <div className="rounded-xl bg-[var(--color-status-progress-subtle)] px-3 py-2">
            <p className="font-display text-[20px] font-semibold leading-none text-[var(--color-status-progress)]">3</p>
            <p className="mt-1 text-[10px] text-text-tertiary">In progress</p>
          </div>
          <div className="rounded-xl bg-[var(--color-status-done-subtle)] px-3 py-2">
            <p className="font-display text-[20px] font-semibold leading-none text-[var(--color-status-done)]">2</p>
            <p className="mt-1 text-[10px] text-text-tertiary">Done</p>
          </div>
        </div>
        <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-overlay-strong">
          <span className="block bg-[var(--color-status-done)]" style={{ width: "11%" }} />
          <span className="block bg-[var(--color-status-progress)]" style={{ width: "16%" }} />
        </div>
      </button>

      <div className="grid grid-cols-3 gap-2" style={revealStyle(open, 2)}>
        {COMMON.map((it) => {
          const on = active === it.label;
          const info = COMMON_INFO[it.label];
          return (
            <button
              key={it.label}
              onClick={() => pick(it.label)}
              className={`flex flex-col items-center gap-1.5 rounded-[16px] p-3 text-center transition-transform duration-200 hover:scale-[1.04] ${on ? "bg-[var(--color-brand-600)]/20 ring-1 ring-[var(--color-brand-600)]/45" : "bg-overlay-default ring-1 ring-transparent hover:bg-hover-interactive hover:ring-border-strong"}`}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-xl ${on ? "bg-[var(--color-brand-500)]/25 text-[var(--color-brand-200)]" : "bg-overlay-strong text-text-secondary"}`}>
                {it.icon}
              </span>
              <span className="text-[11px] font-medium text-text-primary">{it.label}</span>
              <span className="text-[10px] text-text-muted">{info.count} {info.note.replace(/^\d+\s/, "")}</span>
            </button>
          );
        })}
      </div>
      <RareChips open={open} idx={3} onPick={pick} />
    </>
  );
}

/* ---- A4: editorial — airy, hairline dividers, typographic numbers ---- */
function BodyEditorial({ active, setActive, open, close }: BodyCtx) {
  const pick = (l: string) => { setActive(l); close(); };
  return (
    <>
      <button
        onClick={() => pick("Sprint Board")}
        style={revealStyle(open, 1)}
        className="group mb-1 flex w-full items-center gap-3.5 rounded-2xl px-2 py-2.5 text-left transition-colors duration-150 hover:bg-hover-list-item"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-brand-500)] text-white shadow-[0_6px_20px_var(--color-brand-glow)]">
          <KanbanSquare className="h-[22px] w-[22px]" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-[18px] font-semibold tracking-[-0.02em] text-text-primary">Sprint Board</p>
            <span className="font-mono text-[10px] text-text-muted">BT: 139</span>
          </div>
          <p className="mt-0.5 text-[11px] text-text-tertiary">14 to do &middot; 3 in progress &middot; 2 done</p>
        </div>
        <ChevronRight className="h-5 w-5 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
      </button>

      <div className="mx-2 mb-1 h-1 overflow-hidden rounded-full bg-overlay-default" style={revealStyle(open, 2)}>
        <div className="h-full rounded-full bg-[var(--color-brand-400)]" style={{ width: "10%" }} />
      </div>

      <div className="flex flex-col px-1" style={revealStyle(open, 3)}>
        {COMMON.map((it) => {
          const on = active === it.label;
          const info = COMMON_INFO[it.label];
          return (
            <button
              key={it.label}
              onClick={() => pick(it.label)}
              className="group flex items-center gap-3 border-t border-border-subtle py-3 text-left first:border-t-0"
            >
              <span className={`shrink-0 transition-colors ${on ? "text-[var(--color-brand-300)]" : "text-text-tertiary group-hover:text-text-secondary"}`}>{it.icon}</span>
              <span className={`flex-1 text-body-sm transition-colors ${on ? "font-medium text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}>{it.label}</span>
              <span className="font-display text-[15px] font-semibold tabular-nums text-text-secondary">{info.count}</span>
              <span className="w-20 text-right text-[11px] text-text-muted">{info.note}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle px-1 pt-3" style={revealStyle(open, 4)}>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">More</span>
        {RARE.map((it) => (
          <button key={it.label} onClick={() => pick(it.label)} className="text-[11px] text-text-muted transition-colors duration-150 hover:text-text-secondary">
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}

/* ---- C: centered spotlight launchpad — parked for the future ---- */
function BentoSpotlight() {
  const [active, setActive] = useState("Sprint Board");
  const [open, setOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <Stage>
      <FauxBoard />
      <Backdrop open={open} onClose={() => setOpen(false)} strong />

      <button
        onClick={() => { setAccountOpen(false); setOpen((v) => !v); }}
        className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-surface-floating)]/90 px-4 py-2.5 text-body-sm text-text-secondary shadow-[0_10px_30px_-6px_rgba(0,0,0,0.6)] ring-1 ring-border-strong backdrop-blur-xl transition-transform hover:scale-[1.03] active:scale-95"
        style={{ opacity: open ? 0 : 1, pointerEvents: open ? "none" : "auto" }}
      >
        <Search className="h-4 w-4 text-text-tertiary" strokeWidth={1.5} />
        Search or jump to…
        <span className="flex items-center gap-0.5 rounded bg-overlay-default px-1.5 py-0.5 text-[10px] text-text-muted">
          <Command className="h-3 w-3" />K
        </span>
      </button>

      <div
        className={`absolute left-1/2 top-12 z-30 w-[560px] overflow-hidden rounded-[24px] bg-[var(--color-surface-floating)]/95 ${PANEL_SHADOW} backdrop-blur-2xl transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]`}
        style={{ opacity: open ? 1 : 0, transform: open ? "translateX(-50%) scale(1)" : "translateX(-50%) scale(0.95)", pointerEvents: open ? "auto" : "none" }}
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--color-brand-500)]/20 blur-3xl" />
        <div className="relative flex items-center gap-3 border-b border-border-default px-4 py-3" style={revealStyle(open, 0)}>
          <Search className="h-[18px] w-[18px] text-text-tertiary" strokeWidth={1.5} />
          <input autoFocus placeholder="Search views, tickets, actions…" className="flex-1 bg-transparent text-body-lg text-text-primary outline-none placeholder:text-text-muted" />
          <AvatarToggle active={accountOpen} onClick={() => setAccountOpen((v) => !v)} />
        </div>

        {accountOpen ? (
          <div className="p-2">
            <AccountView open={open} />
          </div>
        ) : (
          <div className="relative p-3">
            <button
              onClick={() => { setActive(PRIMARY.label); setOpen(false); }}
              style={revealStyle(open, 1)}
              className="group relative mb-2 flex w-full items-stretch gap-3.5 overflow-hidden rounded-[20px] bg-gradient-to-br from-[var(--color-brand-600)]/35 via-[var(--color-brand-800)]/25 to-[var(--color-brand-950)]/10 p-4 text-left ring-1 ring-[var(--color-brand-600)]/35 transition-transform duration-200 hover:scale-[1.015]"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center self-center rounded-2xl bg-[var(--color-brand-500)] text-white shadow-[0_6px_20px_var(--color-brand-glow)]">
                <KanbanSquare className="h-[22px] w-[22px]" strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-body-lg font-semibold tracking-[-0.01em] text-text-primary">Sprint Board</p>
                  <span className="rounded-md bg-[var(--color-brand-600)]/25 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-brand-200)]">BT: 139</span>
                </div>
                <HeroStats />
              </div>
              <ChevronRight className="absolute right-3.5 top-3.5 h-5 w-5 text-text-tertiary transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text-secondary" strokeWidth={1.5} />
            </button>

            <div className="grid grid-cols-3 gap-2" style={revealStyle(open, 2)}>
              {COMMON.map((it) => {
                const on = active === it.label;
                return (
                  <button
                    key={it.label}
                    onClick={() => { setActive(it.label); setOpen(false); }}
                    className={`group flex items-center gap-2.5 rounded-[16px] p-3 text-left transition-transform duration-200 hover:scale-[1.03] ${on ? "bg-[var(--color-brand-600)]/20 ring-1 ring-[var(--color-brand-600)]/45" : "bg-overlay-default ring-1 ring-transparent hover:bg-hover-interactive hover:ring-border-strong"}`}
                  >
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${on ? "bg-[var(--color-brand-500)]/25 text-[var(--color-brand-200)]" : "bg-overlay-strong text-text-secondary group-hover:text-text-primary"}`}>
                      {it.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-text-primary">{it.label}</span>
                      <span className="block text-[10px] text-text-muted">{COMMON_META[it.label]}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-1 border-t border-border-subtle px-1 pt-3" style={revealStyle(open, 3)}>
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted">More</span>
              {RARE.map((it, i) => (
                <span key={it.label} className="flex items-center">
                  {i > 0 && <span className="mx-1 text-text-muted/40">&middot;</span>}
                  <button onClick={() => { setActive(it.label); setOpen(false); }} className="rounded px-1 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text-secondary">
                    {it.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Stage>
  );
}

const BENTO_VARIANTS = [
  { id: "tiles", name: "A1 · Soft tiles", el: <StackShell renderBody={(c) => <BodySoftTiles {...c} />} /> },
  { id: "list", name: "A2 · List rows", el: <StackShell renderBody={(c) => <BodyList {...c} />} /> },
  { id: "stat", name: "A3 · Stat dashboard", el: <StackShell renderBody={(c) => <BodyStat {...c} />} /> },
  { id: "editorial", name: "A4 · Editorial", el: <StackShell width={380} renderBody={(c) => <BodyEditorial {...c} />} /> },
  { id: "spotlight", name: "C · Spotlight (future)", el: <BentoSpotlight /> },
];

function ConceptBento() {
  const [variant, setVariant] = useState("tiles");
  const current = BENTO_VARIANTS.find((v) => v.id === variant)!;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {BENTO_VARIANTS.map((v) => {
          const on = v.id === variant;
          return (
            <button
              key={v.id}
              onClick={() => setVariant(v.id)}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 ${on ? "border-[var(--color-brand-500)] bg-[var(--color-brand-600)]/15 text-[var(--color-brand-200)]" : "border-border-default text-text-tertiary hover:border-border-strong hover:text-text-secondary"}`}
            >
              {v.name}
            </button>
          );
        })}
      </div>
      {current.el}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[620px] w-full overflow-hidden rounded-2xl bg-[var(--color-surface-base)] ring-1 ring-border-default">
      {children}
    </div>
  );
}

/* ================================================================== */
/* Page shell                                                          */
/* ================================================================== */

const CONCEPTS = [
  { id: "bento", name: "Bento launcher", blurb: "Front-runner (vertical stack). The A1-A4 tabs below explore how the panel CONTENT is presented; Spotlight (C) is parked as a future direction. All keep: Sprint Board hero, demoted rare links, and the account menu behind the avatar.", render: <ConceptBento /> },
  { id: "dock", name: "Floating glass dock", blurb: "Detached, blurred capsule floating off the edge. Sprint Board is a filled hero tile; rare items hide behind a “more” disc. Profile floats separately top-left.", render: <ConceptFloatingDock /> },
  { id: "rail", name: "Hover-expand rail", blurb: "Thin rail that widens on hover to reveal labels. Tiered: Sprint Board big up top, common in the middle, rarely-used dimmed at the bottom. Profile moved to the top.", render: <ConceptHoverRail /> },
  { id: "topbar", name: "Top bar + ⌘K", blurb: "No left rail at all. Primary + common live in a segmented top bar; everything rare is demoted into a command palette. Maximum board width.", render: <ConceptTopBar /> },
  { id: "radial", name: "Radial FAB", blurb: "A single floating action button bottom-left fans out into a radial arc of destinations. Playful, gets fully out of the way until summoned. Profile sits top-right.", render: <ConceptRadialFab /> },
];

export default function SidebarConceptsPage() {
  const [selected, setSelected] = useState(CONCEPTS[0].id);
  const current = CONCEPTS.find((c) => c.id === selected)!;

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-[1280px]">
        <header className="mb-6">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">/dev/sidebar · exploration</p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">Sidebar concepts</h1>
          <p className="mt-1 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Bento launcher is the front-runner. Its A1-A4 tabs try different ways to present the content inside the panel. Priority model: <strong className="text-text-primary">Sprint Board</strong> is primary;
            Chat / Story Writer / Refinement are common; Epics / Pipelines / Stakeholder / Cleanup are demoted as rarely-used.
          </p>
        </header>

        {/* concept switcher */}
        <div className="mb-5 flex flex-wrap gap-2">
          {CONCEPTS.map((c) => {
            const isOn = c.id === selected;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`rounded-full px-4 py-2 text-body-sm font-medium transition-colors duration-150 ${
                  isOn
                    ? "bg-[var(--color-brand-500)] text-white shadow-[0_4px_16px_var(--color-brand-glow)]"
                    : "bg-overlay-default text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        <p key={current.id} className="mb-4 max-w-3xl text-body-sm leading-[1.7] text-text-tertiary">
          {current.blurb}
        </p>

        {current.render}

        <p className="mt-4 text-[11px] text-text-muted">
          Interactive mockups over a faux board. Click the launcher / avatar to open the panel and the account view. Pick a direction and I’ll wire it into the real <code>Sidebar.tsx</code>.
        </p>
      </div>
    </div>
  );
}
