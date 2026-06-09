"use client";

/**
 * Throwaway exploration: redesign of the Sprint Board "views" bar (the strip with
 * All / To refine / Backlog / BT: 139... / Overall refinement + the right-side
 * column/sort/filter tools, today in SprintSlots.tsx).
 *
 * The bar today mixes four kinds of thing in one flat row, so nothing stands out:
 *   SCOPES     structural views      All, Backlog (unassigned), BT: Backlog
 *   SPRINTS    rotating time boxes    BT: 139 (active), 140, 141
 *   BOOKMARKS  saved filters/labels   To refine, Overall refinement
 *   DEAD                              BT: TODO (EOL -> removed here)
 *
 * Each concept separates these by type, tucks bookmarks behind a menu, and moves
 * sprint overview / create-sprint into an overflow menu. D (hybrid) is the chosen
 * direction. Reachable at /dev/exploration/board-tabs; not linked from app nav.
 */

import { useState } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  ArrowLeft,
  Inbox,
  Plus,
  Bookmark,
  MoreHorizontal,
  Columns3,
  ArrowUpDown,
  ListFilter,
  ChevronDown,
  Check,
  CalendarPlus,
  ListTree,
  Layers,
} from "lucide-react";

/* ------------------------------------------------------------------ data -- */

type Scope = { key: string; label: string; icon?: LucideIcon };
type Sprint = { key: string; label: string; active?: boolean };

const SCOPES: Scope[] = [
  { key: "backlog", label: "Backlog", icon: Inbox },
  { key: "bt-backlog", label: "BT: Backlog" },
];
const SPRINTS: Sprint[] = [
  { key: "139", label: "BT: 139", active: true },
  { key: "140", label: "BT: 140" },
  { key: "141", label: "BT: 141" },
];
const BOOKMARKS: Scope[] = [
  { key: "to-refine", label: "To refine" },
  { key: "overall", label: "Overall refinement" },
];

/* ----------------------------------------------------------- shared bits -- */

const GLOW = { boxShadow: "0 0 8px var(--color-brand-glow)" } as const;

function Divider() {
  return <span className="mx-1.5 h-5 w-px shrink-0 self-center bg-border-strong" aria-hidden />;
}

function ActiveDot({ on }: { on: boolean }) {
  return (
    <span
      className={`h-[7px] w-[7px] shrink-0 rounded-full ${on ? "bg-[var(--color-brand-400)]" : "bg-overlay-strong"}`}
      style={on ? GLOW : undefined}
    />
  );
}

/* Right-side view tools: columns / sort / filter (kept as-is from the real bar). */
function ViewTools() {
  const tools: { icon: LucideIcon; title: string; on?: boolean }[] = [
    { icon: Columns3, title: "Show / hide fields" },
    { icon: ArrowUpDown, title: "Sort" },
    { icon: ListFilter, title: "Filter", on: true },
  ];
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
      {tools.map(({ icon: Icon, title, on }) => (
        <button
          key={title}
          title={title}
          className={`group relative grid h-7 w-7 place-items-center rounded-md cursor-pointer transition-colors duration-100 ${
            on
              ? "text-[var(--color-brand-400)] hover:bg-hover-list-item"
              : "text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
          }`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
          {on && (
            <span className="absolute -right-0 -top-0 h-[6px] w-[6px] rounded-full bg-[var(--color-brand-400)] ring-2 ring-[var(--color-surface-base)]" />
          )}
        </button>
      ))}
    </div>
  );
}

/* A self-closing dropdown shell with a click-away catcher. */
function Dropdown({
  open,
  onClose,
  children,
  align = "left",
  width = "w-56",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  if (!open) return null;
  return (
    <>
      <button className="fixed inset-0 z-40 cursor-default" aria-hidden tabIndex={-1} onClick={onClose} />
      <div
        className={`absolute top-full z-50 mt-1.5 ${align === "right" ? "right-0" : "left-0"} ${width} overflow-hidden rounded-xl bg-[var(--color-surface-floating)] p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8),0_0_0_1px_var(--color-border-strong)]`}
      >
        {children}
      </div>
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  selected,
  hint,
  onClick,
}: {
  icon?: LucideIcon;
  label: string;
  selected?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-body-sm transition-colors duration-100 ${
        selected ? "text-[var(--color-brand-200)]" : "text-text-secondary hover:bg-hover-list-item hover:text-text-primary"
      }`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />}
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-brand-400)]" strokeWidth={2} />}
    </button>
  );
}

/* The bookmark menu — collapses saved filters (To refine, Overall refinement...). */
function BookmarkMenu({ activeKey, onPick }: { activeKey: string; onPick: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const active = BOOKMARKS.find((b) => b.key === activeKey);
  return (
    <div className="relative shrink-0 self-center">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Saved filters"
        className={`group flex h-7 items-center gap-1.5 rounded-md px-2 text-body-sm font-medium cursor-pointer transition-colors duration-100 ${
          active
            ? "bg-[color-mix(in_srgb,var(--color-brand-400)_14%,transparent)] text-[var(--color-brand-200)]"
            : "text-text-tertiary hover:bg-hover-list-item hover:text-text-secondary"
        }`}
      >
        <Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} fill={active ? "currentColor" : "none"} />
        <span className="hidden sm:inline">{active ? active.label : "Saved"}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)}>
        <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Saved filters</p>
        {BOOKMARKS.map((b) => (
          <MenuItem key={b.key} icon={Bookmark} label={b.label} selected={activeKey === b.key} onClick={() => { onPick(b.key); setOpen(false); }} />
        ))}
        <div className="my-1 h-px bg-border-subtle" />
        <MenuItem icon={Plus} label="Save current view…" onClick={() => setOpen(false)} />
      </Dropdown>
    </div>
  );
}

/* Overflow menu — sprint overview + create sprint, out of the main flow. */
function OverflowMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0 self-center">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Sprint actions"
        className="grid h-7 w-7 place-items-center rounded-md text-text-muted cursor-pointer transition-colors duration-100 hover:bg-hover-list-item hover:text-text-secondary"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)} width="w-52">
        <MenuItem icon={ListTree} label="Sprint overview" hint="all sprints" onClick={() => setOpen(false)} />
        <MenuItem icon={CalendarPlus} label="New sprint" onClick={() => setOpen(false)} />
      </Dropdown>
    </div>
  );
}

/* Plain "+" create-sprint button (used by variants that keep it inline). */
function CreateSprintButton() {
  return (
    <button
      title="Create sprint"
      className="grid h-6 w-6 shrink-0 self-center place-items-center rounded-md text-text-muted cursor-pointer transition-colors duration-100 hover:bg-overlay-default hover:text-text-secondary"
    >
      <Plus size={13} strokeWidth={1.5} />
    </button>
  );
}

/* A sprint pill (dot + label + active underline), matching the live bar. */
function SprintPill({ sprint, active, onClick }: { sprint: Sprint; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex h-7 shrink-0 items-center gap-1.5 self-center px-2.5 text-body-sm font-medium cursor-pointer transition-colors duration-100 ${
        active ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      {sprint.active && <ActiveDot on={active} />}
      <span>{sprint.label}</span>
      {active && <span className="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />}
    </button>
  );
}

/* Scope picker dropdown (used by variant B + hybrid). */
function ScopeDropdown({
  activeKey,
  onPick,
  placeholder = "Backlogs",
}: {
  activeKey: string;
  onPick: (k: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = SCOPES.find((s) => s.key === activeKey);
  const ActiveIcon = active?.icon ?? Layers;
  return (
    <div className="relative shrink-0 self-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-body-sm font-medium cursor-pointer transition-colors duration-100 ${
          active
            ? "border-border-strong bg-[color-mix(in_srgb,var(--color-text-primary)_4%,transparent)] text-text-primary"
            : "border-border-default text-text-tertiary hover:border-border-strong hover:text-text-secondary"
        }`}
      >
        <ActiveIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
        <span>{active ? active.label : placeholder}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>
      <Dropdown open={open} onClose={() => setOpen(false)}>
        <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Backlogs</p>
        {SCOPES.map((s) => (
          <MenuItem key={s.key} icon={s.icon} label={s.label} selected={activeKey === s.key} onClick={() => { onPick(s.key); setOpen(false); }} />
        ))}
      </Dropdown>
    </div>
  );
}

/* The "All / full view" pill — brand-tinted, the most-used default. */
function AllPill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Show all tickets across sprints"
      className={`flex h-7 shrink-0 items-center self-center rounded-md px-2.5 text-body-sm font-semibold tracking-wide cursor-pointer transition-colors duration-100 ${
        active ? "text-[var(--color-brand-600)]" : "text-[var(--color-brand-500)] hover:text-[var(--color-brand-600)]"
      }`}
      style={{
        backgroundColor: active
          ? "color-mix(in srgb, var(--color-brand-400) 18%, transparent)"
          : "color-mix(in srgb, var(--color-brand-400) 12%, transparent)",
      }}
    >
      All
    </button>
  );
}

/* ================================================================== */
/* VARIANT A — Zoned single row                                        */
/* ================================================================== */

function VariantZoned() {
  const [active, setActive] = useState("139");
  return (
    <Bar>
      {/* scopes */}
      <AllPill active={active === "all"} onClick={() => setActive("all")} />
      {SCOPES.map((s) => {
        const on = active === s.key;
        const Icon = s.icon;
        return (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={`flex h-7 shrink-0 items-center gap-1.5 self-center rounded-md border px-2.5 text-body-sm font-medium cursor-pointer transition-colors duration-100 ${
              on ? "border-border-strong text-text-primary" : "border-border-default text-text-tertiary hover:border-border-strong hover:text-text-secondary"
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />}
            {s.label}
          </button>
        );
      })}

      <Divider />

      {/* sprints */}
      {SPRINTS.map((s) => (
        <SprintPill key={s.key} sprint={s} active={active === s.key} onClick={() => setActive(s.key)} />
      ))}
      <OverflowMenu />

      <Divider />

      {/* bookmarks */}
      <BookmarkMenu activeKey={active} onPick={setActive} />

      <ViewTools />
    </Bar>
  );
}

/* ================================================================== */
/* VARIANT B — Scope dropdown                                          */
/* ================================================================== */

function VariantScopeDropdown() {
  const [active, setActive] = useState("139");
  const sprintActive = SPRINTS.some((s) => s.key === active);
  return (
    <Bar>
      <AllPill active={active === "all"} onClick={() => setActive("all")} />
      <ScopeDropdown activeKey={active} onPick={setActive} />

      <Divider />

      {SPRINTS.map((s) => (
        <SprintPill key={s.key} sprint={s} active={active === s.key && sprintActive} onClick={() => setActive(s.key)} />
      ))}
      <CreateSprintButton />

      <Divider />

      <BookmarkMenu activeKey={active} onPick={setActive} />

      <ViewTools />
    </Bar>
  );
}

/* ================================================================== */
/* VARIANT D — Hybrid (recommended): All pill + scope dropdown         */
/* ================================================================== */

function VariantHybrid() {
  const [active, setActive] = useState("139");
  const sprintActive = SPRINTS.some((s) => s.key === active);
  return (
    <Bar>
      <AllPill active={active === "all"} onClick={() => setActive("all")} />
      <ScopeDropdown activeKey={active} onPick={setActive} />

      <Divider />

      {SPRINTS.map((s) => (
        <SprintPill key={s.key} sprint={s} active={active === s.key && sprintActive} onClick={() => setActive(s.key)} />
      ))}
      <OverflowMenu />

      <Divider />

      <BookmarkMenu activeKey={active} onPick={setActive} />

      <ViewTools />
    </Bar>
  );
}

/* ------------------------------------------------------------------ */
/* The bar chrome + faux board context underneath                      */
/* ------------------------------------------------------------------ */

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-12 items-stretch gap-1 border-b border-border-default bg-[var(--color-surface-base)] px-3">
      <div className="relative z-10 flex min-w-0 flex-1 items-stretch gap-1">{children}</div>
    </div>
  );
}

const FAUX_ROWS: [string, string, string][] = [
  ["VPL-46101", "Display strikethrough (original) price per rate in room results", "BT: Rooms"],
  ["VPL-45991", "Auto select correct hotel for BT based on hotel domain", ""],
  ["VPL-36166", "Configurable maximum booking period per hotel", "BT: Dates"],
  ["VPL-45948", "Add and remove group codes manually in the bookingtool", "Group Reservations"],
  ["VPL-46304", "Research Valk Loyal SOAP security", "Tech: Security"],
  ["VPL-45943", "Restrict booking calendar to group dates", "Group Reservations"],
];

function BoardStage({ bar }: { bar: React.ReactNode }) {
  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-2xl bg-[var(--color-surface-base)] ring-1 ring-border-default">
      {bar}

      {/* selected-sprint context strip */}
      <div className="flex h-[42px] items-center gap-3 border-b border-border-subtle px-5">
        <span className="font-mono text-body-sm font-medium text-text-secondary">BT: 139</span>
        <span className="text-[12px] text-text-tertiary">Sprint goal — stabilise the booking flow</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-text-muted">18%</span>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-overlay-default">
            <div className="h-full w-[18%] rounded-full bg-[var(--color-brand-500)]" />
          </div>
        </div>
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
              <span className="shrink-0 rounded-full border border-border-default px-2 py-0.5 text-[11px] text-text-tertiary">{tag}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Page shell                                                          */
/* ================================================================== */

const CONCEPTS = [
  {
    id: "hybrid",
    name: "D · Hybrid (recommended)",
    blurb:
      "All is a brand-tinted pill (no logomark — the bridge_ wordmark already lives in the header above this bar). A single Backlogs dropdown holds the structural scopes and scales as more teams arrive, sprints stay one-click pills, bookmarks tuck behind the saved-filters menu, and sprint overview / new sprint sit in the ⋯ overflow.",
    render: <BoardStage bar={<VariantHybrid />} />,
  },
  {
    id: "zoned",
    name: "A · Zoned row",
    blurb:
      "Lowest-risk evolution. Same single row, but split into three labelled zones with hairline dividers: scopes (All · Backlog · BT: Backlog) → sprints (active = glowing dot) with a ⋯ for overview/new → saved filters behind a bookmark menu. Instantly more legible; doesn't scale as well once several teams each have a backlog.",
    render: <BoardStage bar={<VariantZoned />} />,
  },
  {
    id: "scope",
    name: "B · Scope dropdown",
    blurb:
      "Most scalable. Structural scopes collapse into one Backlogs dropdown so the sprints get the whole bar. Future teams (DT, etc.) just drop into the menu. Trade-off: switching scope is click → select instead of one click. (D is this plus the ⋯ overflow.)",
    render: <BoardStage bar={<VariantScopeDropdown />} />,
  },
];

export default function BoardTabsExplorationPage() {
  const [selected, setSelected] = useState(CONCEPTS[0].id);
  const current = CONCEPTS.find((c) => c.id === selected)!;

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-[1280px]">
        <Link
          href="/dev/exploration"
          className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Explorations
        </Link>

        <header className="mb-6">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/board-tabs · exploration
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">Sprint Board views bar</h1>
          <p className="mt-1 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            The bar today flattens four different kinds of thing into one row. Each concept separates them by type:{" "}
            <strong className="text-text-primary">scopes</strong> (All, backlogs), <strong className="text-text-primary">sprints</strong>{" "}
            (the rotating time boxes), and <strong className="text-text-primary">bookmarks</strong> (saved filters) — with{" "}
            <code className="text-text-tertiary">BT: TODO</code> dropped and sprint overview / new sprint moved into a ⋯ menu.
          </p>
        </header>

        {/* concept switcher */}
        <div className="mb-5 flex flex-wrap gap-2">
          {CONCEPTS.map((c) => {
            const on = c.id === selected;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`rounded-full px-4 py-2 text-body-sm font-medium transition-colors duration-150 cursor-pointer ${
                  on
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
          Interactive mockups over a faux board. Click tabs, the Backlogs / Saved / ⋯ menus, and the logomark. Shared rules across
          all: <code>BT: TODO</code> removed, bookmarks behind a menu, sprint overview + new sprint behind ⋯. Pick a direction and
          I&apos;ll wire it into the real <code>SprintSlots.tsx</code>.
        </p>
      </div>
    </div>
  );
}
