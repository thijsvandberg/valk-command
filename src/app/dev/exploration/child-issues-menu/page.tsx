"use client";

/**
 * Throwaway exploration: redesign of the Child-Issues header controls, which used
 * to be four separate icons (view toggle, planning, filter, create) and were first
 * collapsed into one flat, tall "..." menu.
 *
 * Two rounds of exploration, both preserved below for reference:
 *
 *   Round 1 - menu layout       A Tabs · B Compact · C Two-pane   -> C chosen
 *   Round 2 - C's View pane     1 Radio rows · 2 Trailing tick · 3 Cards -> 1 chosen
 *
 * SHIPPED: Two-pane (C) with a radio-row View pane, using the shared subtle-tint
 * Checkbox / Radio. Live in ChildIssueListHeader.tsx.
 *
 * Reachable at /dev/exploration/child-issues-menu; not linked from app nav.
 */

import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/shared/Checkbox";
import { Radio } from "@/components/shared/Radio";
import {
  type LucideIcon,
  ArrowLeft,
  LayoutList,
  CalendarRange,
  Ruler,
  Plus,
  Check,
  Filter,
  Columns3,
  Eye,
  EyeOff,
  CircleCheck,
} from "lucide-react";

/* --------------------------------------------------------------- data -- */

type StatusKey = "all" | "todo" | "inprogress" | "done";
const STATUSES: { key: StatusKey; label: string; count: number }[] = [
  { key: "all", label: "All", count: 19 },
  { key: "todo", label: "To Do", count: 13 },
  { key: "inprogress", label: "In Progress", count: 1 },
  { key: "done", label: "Done", count: 5 },
];

const COLUMNS: { id: string; label: string }[] = [
  { id: "checkboxes", label: "Checkboxes" },
  { id: "keys", label: "Issue keys" },
  { id: "assignees", label: "Assignees" },
  { id: "status", label: "Status" },
  { id: "points", label: "Story points" },
  { id: "bv", label: "Business value" },
  { id: "sprint", label: "Sprint" },
  { id: "subtasks", label: "Subtask count" },
];
const DEFAULT_VISIBLE = new Set(["checkboxes", "keys", "status", "points", "bv", "sprint"]);

type ViewMode = "list" | "sprint";
const VIEW_MODES: { mode: ViewMode; label: string; Icon: LucideIcon }[] = [
  { mode: "list", label: "List", Icon: LayoutList },
  { mode: "sprint", label: "By sprint", Icon: CalendarRange },
];

type ViewVariant = "radio" | "tick" | "cards";

/* ----------------------------------------------------------- primitives -- */

const PANEL =
  "rounded-xl border border-border-default bg-[var(--color-surface-floating)] shadow-[var(--shadow-popover)]";
const LABEL = "px-1 text-caption font-semibold uppercase tracking-wider text-text-muted";
const DIVIDER = "h-px bg-border-subtle";
const ROW = "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-[7px] text-body-sm hover:bg-hover-list-item";

// Both delegate to the shared canonical components so this reference page stays in sync.
function CheckBox({ on }: { on: boolean }) {
  return <Checkbox checked={on} />;
}
function RadioDot({ on }: { on: boolean }) {
  return <Radio checked={on} />;
}

function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-overlay-subtle p-0.5">
      {VIEW_MODES.map(({ mode, label, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded px-2 py-1 text-caption font-medium transition-colors duration-150 ${
              active
                ? "bg-[var(--color-surface-elevated)] text-[var(--color-brand-400)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon size={13} strokeWidth={1.5} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function TogglePill({
  on,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  on: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-caption font-medium transition-colors duration-150 ${
        on
          ? "border-[var(--color-brand-400)]/40 bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
          : "border-border-default text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
      }`}
    >
      <Icon size={13} strokeWidth={1.5} />
      {label}
      {badge != null && <span className="tabular-nums opacity-70">{badge}</span>}
    </button>
  );
}

function PlanningRow({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={ROW}>
      <CheckBox on={on} />
      <Ruler size={13} strokeWidth={1.5} className="text-text-tertiary" />
      <span className="text-text-secondary">Planning</span>
    </button>
  );
}

function CreateRow() {
  return (
    <button className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm text-text-secondary transition-colors duration-150 hover:bg-hover-list-item hover:text-text-primary">
      <Plus size={14} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
      <span>New child issue</span>
    </button>
  );
}

function useColumnsState() {
  const [visible, setVisible] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const toggle = (id: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { visible, toggle };
}

/* ---------------------------------------------- A: tabs (round 1, rejected) -- */

function ConceptTabs() {
  const [view, setView] = useState<ViewMode>("sprint");
  const [planning, setPlanning] = useState(true);
  const [status, setStatus] = useState<StatusKey>("all");
  const [hideDeprecated, setHideDeprecated] = useState(true);
  const { visible, toggle } = useColumnsState();
  const [tab, setTab] = useState<"filter" | "columns">("filter");

  return (
    <div className={`${PANEL} w-[260px] overflow-hidden`}>
      <div className="p-2">
        <ViewToggle value={view} onChange={setView} />
        <div className="mt-1">
          <PlanningRow on={planning} onClick={() => setPlanning((v) => !v)} />
        </div>
      </div>
      <div className={DIVIDER} />
      <div className="flex items-center gap-1 px-2 pt-2">
        {([
          { key: "filter", label: "Filter", Icon: Filter },
          { key: "columns", label: "Columns", Icon: Columns3 },
        ] as const).map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-semibold transition-colors duration-150 ${
                active
                  ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
            >
              <Icon size={13} strokeWidth={1.5} />
              {label}
            </button>
          );
        })}
      </div>
      <div className="p-1">
        {tab === "filter" ? (
          <>
            {STATUSES.map((s) => (
              <button key={s.key} onClick={() => setStatus(s.key)} className={ROW}>
                <span className={status === s.key ? "font-medium text-text-primary" : "text-text-secondary"}>{s.label}</span>
                <span className="ml-auto tabular-nums text-caption text-text-muted">{s.count}</span>
              </button>
            ))}
            <button onClick={() => setHideDeprecated((v) => !v)} className={ROW}>
              <CheckBox on={hideDeprecated} />
              <span className="text-text-secondary">Hide deprecated</span>
              <span className="ml-auto tabular-nums text-caption text-text-muted">4</span>
            </button>
          </>
        ) : (
          COLUMNS.map((c) => (
            <button key={c.id} onClick={() => toggle(c.id)} className={ROW}>
              <CheckBox on={visible.has(c.id)} />
              <span className="text-text-secondary">{c.label}</span>
            </button>
          ))
        )}
      </div>
      <div className={DIVIDER} />
      <div className="p-1">
        <CreateRow />
      </div>
    </div>
  );
}

/* ------------------------------------------ B: compact (round 1, rejected) -- */

function ConceptCompact() {
  const [view, setView] = useState<ViewMode>("sprint");
  const [planning, setPlanning] = useState(true);
  const [status, setStatus] = useState<StatusKey>("all");
  const [hideDeprecated, setHideDeprecated] = useState(true);
  const { visible, toggle } = useColumnsState();

  return (
    <div className={`${PANEL} w-[300px] overflow-hidden p-3`}>
      <ViewToggle value={view} onChange={setView} />

      <div className="mt-3 flex flex-wrap gap-1">
        {STATUSES.map((s) => {
          const active = status === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors duration-150 ${
                active
                  ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.10] text-[var(--color-brand-400)]"
                  : "border-border-default text-text-secondary hover:bg-overlay-subtle"
              }`}
            >
              {s.label}
              <span className="tabular-nums opacity-60">{s.count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1.5">
        <TogglePill on={planning} onClick={() => setPlanning((v) => !v)} icon={Ruler} label="Planning" />
        <TogglePill
          on={hideDeprecated}
          onClick={() => setHideDeprecated((v) => !v)}
          icon={hideDeprecated ? EyeOff : Eye}
          label="Hide deprecated"
          badge={4}
        />
      </div>

      <div className={`${DIVIDER} my-3`} />

      <div className={`${LABEL} mb-2`}>Columns</div>
      <div className="grid grid-cols-2 gap-1">
        {COLUMNS.map((c) => {
          const on = visible.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-caption transition-colors duration-150 ${
                on
                  ? "border-[var(--color-brand-400)]/40 bg-[var(--color-brand-500)]/[0.06] text-text-primary"
                  : "border-border-default text-text-muted hover:bg-overlay-subtle"
              }`}
            >
              <CheckBox on={on} />
              <span className="truncate">{c.label}</span>
            </button>
          );
        })}
      </div>

      <div className={`${DIVIDER} my-3`} />
      <CreateRow />
    </div>
  );
}

/* -------------------------------------------------------- C's VIEW pane -- */

function ViewPane({
  variant,
  view,
  setView,
  planning,
  setPlanning,
}: {
  variant: ViewVariant;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  planning: boolean;
  setPlanning: () => void;
}) {
  if (variant === "cards") {
    return (
      <div>
        <div className="grid grid-cols-2 gap-1.5 px-1 pt-1">
          {VIEW_MODES.map(({ mode, label, Icon }) => {
            const active = view === mode;
            return (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`relative flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2.5 transition-colors duration-150 ${
                  active
                    ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.06]"
                    : "border-border-default hover:bg-overlay-subtle"
                }`}
              >
                <Icon
                  size={15}
                  strokeWidth={1.5}
                  className={active ? "text-[var(--color-brand-400)]" : "text-text-tertiary"}
                />
                <span className={`text-body-sm ${active ? "font-medium text-text-primary" : "text-text-secondary"}`}>
                  {label}
                </span>
                {active && (
                  <Check size={12} strokeWidth={3} className="absolute right-2 top-2 text-[var(--color-brand-400)]" />
                )}
              </button>
            );
          })}
        </div>
        <div className={`${DIVIDER} my-1`} />
        <PlanningRow on={planning} onClick={setPlanning} />
      </div>
    );
  }

  return (
    <div>
      {VIEW_MODES.map(({ mode, label, Icon }) => {
        const active = view === mode;
        return (
          <button key={mode} onClick={() => setView(mode)} className={`${ROW} ${active ? "bg-[var(--color-brand-500)]/[0.06]" : ""}`}>
            {variant === "radio" && <RadioDot on={active} />}
            <Icon
              size={13}
              strokeWidth={1.5}
              className={active ? "text-[var(--color-brand-400)]" : "text-text-tertiary"}
            />
            <span className={active ? "font-medium text-text-primary" : "text-text-secondary"}>{label}</span>
            {variant === "tick" && active && (
              <Check size={14} strokeWidth={2.5} className="ml-auto text-[var(--color-brand-400)]" />
            )}
          </button>
        );
      })}
      <div className={`${DIVIDER} my-1`} />
      <PlanningRow on={planning} onClick={setPlanning} />
    </div>
  );
}

/* ----------------------------------------------- C: two-pane (the shell) -- */

function ConceptTwoPane({ viewVariant }: { viewVariant: ViewVariant }) {
  const [view, setView] = useState<ViewMode>("sprint");
  const [planning, setPlanning] = useState(true);
  const [status, setStatus] = useState<StatusKey>("all");
  const [hideDeprecated, setHideDeprecated] = useState(true);
  const { visible, toggle } = useColumnsState();
  const [pane, setPane] = useState<"view" | "filter" | "columns">("view");

  const rail: { key: typeof pane; label: string; Icon: LucideIcon }[] = [
    { key: "view", label: "View", Icon: Eye },
    { key: "filter", label: "Filter", Icon: Filter },
    { key: "columns", label: "Columns", Icon: Columns3 },
  ];

  return (
    <div className={`${PANEL} w-[360px] overflow-hidden`}>
      <div className="flex">
        {/* left rail */}
        <div className="w-[112px] shrink-0 border-r border-border-subtle bg-overlay-subtle/40 p-1.5">
          {rail.map(({ key, label, Icon }) => {
            const active = pane === key;
            return (
              <button
                key={key}
                onClick={() => setPane(key)}
                className={`mb-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-body-sm transition-colors duration-150 ${
                  active
                    ? "bg-[var(--color-surface-floating)] font-medium text-[var(--color-brand-400)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                <Icon size={14} strokeWidth={1.5} />
                {label}
              </button>
            );
          })}
        </div>

        {/* right content */}
        <div className="min-h-[176px] flex-1 p-2">
          {pane === "view" && (
            <ViewPane
              variant={viewVariant}
              view={view}
              setView={setView}
              planning={planning}
              setPlanning={() => setPlanning((v) => !v)}
            />
          )}

          {pane === "filter" && (
            <div>
              {STATUSES.map((s) => {
                const active = status === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStatus(s.key)}
                    className={`${ROW} ${active ? "bg-[var(--color-brand-500)]/[0.06]" : ""}`}
                  >
                    <span className={active ? "font-medium text-text-primary" : "text-text-secondary"}>{s.label}</span>
                    <span className="ml-auto tabular-nums text-caption text-text-muted">{s.count}</span>
                  </button>
                );
              })}
              <div className={`${DIVIDER} my-1`} />
              <button onClick={() => setHideDeprecated((v) => !v)} className={ROW}>
                <CheckBox on={hideDeprecated} />
                <span className="text-text-secondary">Hide deprecated</span>
                <span className="ml-auto tabular-nums text-caption text-text-muted">4</span>
              </button>
            </div>
          )}

          {pane === "columns" && (
            <div className="grid grid-cols-2 gap-x-1">
              {COLUMNS.map((c) => (
                <button key={c.id} onClick={() => toggle(c.id)} className={ROW}>
                  <CheckBox on={visible.has(c.id)} />
                  <span className="truncate text-text-secondary">{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={DIVIDER} />
      <div className="p-1">
        <CreateRow />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the page -- */

function ShippedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-status-done-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-status-done)]">
      <CircleCheck size={11} strokeWidth={2} />
      Shipped
    </span>
  );
}

function Variant({
  badge,
  title,
  rationale,
  shipped = false,
  children,
}: {
  badge: string;
  title: string;
  rationale: string;
  shipped?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`grid h-6 w-6 place-items-center rounded-md text-caption font-bold ${
            shipped
              ? "bg-[var(--color-status-done-subtle)] text-[var(--color-status-done)]"
              : "bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-400)]"
          }`}
        >
          {badge}
        </span>
        <span className="text-body font-semibold text-text-primary">{title}</span>
        {shipped && <ShippedPill />}
      </div>
      <p className="mb-4 max-w-[360px] text-body-sm leading-[1.6] text-text-muted">{rationale}</p>
      {children}
    </div>
  );
}

export default function ChildIssuesMenuExploration() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-10 py-8">
      <Link
        href="/dev/exploration"
        className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-muted transition-colors duration-150 hover:text-text-secondary"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Exploration
      </Link>

      <h1 className="text-heading font-semibold text-text-primary">Child Issues menu</h1>
      <p className="mt-2 max-w-[760px] text-body-sm leading-[1.7] text-text-muted">
        The header controls (view, planning, filter, columns, create) started as four loose icons, then a single
        flat, tall menu. Two rounds of exploration are preserved below: first the menu layout, then how C&rsquo;s View
        pane should look.
      </p>

      {/* Shipped summary */}
      <div className="mt-5 max-w-[760px] rounded-xl border border-[var(--color-status-done)]/30 bg-[var(--color-status-done-subtle)]/50 p-4">
        <div className="mb-1.5 flex items-center gap-2">
          <ShippedPill />
          <span className="text-body-sm font-semibold text-text-primary">What shipped</span>
        </div>
        <p className="text-body-sm leading-[1.6] text-text-secondary">
          <strong className="text-text-primary">Two-pane (C)</strong> with a <strong className="text-text-primary">radio-row
          View pane (1)</strong>, using the shared subtle-tint Checkbox &amp; Radio. A category rail (View / Filter /
          Columns) keeps the panel short regardless of how many columns exist. Live in{" "}
          <code className="rounded bg-overlay-subtle px-1 py-0.5 font-mono text-caption">ChildIssueListHeader.tsx</code>.
        </p>
      </div>

      {/* Round 1: layout concepts */}
      <h2 className="mt-12 text-heading-sm font-semibold text-text-primary">Round 1 &middot; Menu layout</h2>
      <p className="mt-1 max-w-[680px] text-body-sm leading-[1.6] text-text-muted">
        Three ways to organise the flat menu so the column list stops dominating. C shown with its final radio View pane.
      </p>
      <div className="mt-8 flex flex-wrap items-start gap-x-14 gap-y-12">
        <Variant
          badge="A"
          title="Tabs"
          rationale="Quick controls (view, planning) pinned on top; Status and Columns hidden behind a Filter / Columns tab. Shortest panel, but one extra click to switch groups."
        >
          <ConceptTabs />
        </Variant>
        <Variant
          badge="B"
          title="Compact"
          rationale="Everything visible: status as count pills, two display toggles side by side, fields as a two-column grid. Half the height, nothing hidden, but a denser mix of control shapes."
        >
          <ConceptCompact />
        </Variant>
        <Variant
          badge="C"
          title="Two-pane"
          rationale="A category rail (View / Filter / Columns) with the chosen group on the right. Panel height stays fixed no matter how many fields exist. The chosen direction."
          shipped
        >
          <ConceptTwoPane viewVariant="radio" />
        </Variant>
      </div>

      {/* Round 2: view pane */}
      <h2 className="mt-16 text-heading-sm font-semibold text-text-primary">Round 2 &middot; C&rsquo;s View pane</h2>
      <p className="mt-1 max-w-[680px] text-body-sm leading-[1.6] text-text-muted">
        C&rsquo;s View pane first mixed a segmented toggle with a checkbox, unlike the row-based Filter and Columns panes.
        These keep the shell identical and only vary the View pane. Click the rail to compare with Filter and Columns.
      </p>
      <div className="mt-8 flex flex-wrap items-start gap-x-14 gap-y-12">
        <Variant
          badge="1"
          title="Radio rows"
          rationale="List and By sprint become rows with a leading radio dot, directly above the Planning checkbox. Same row rhythm as Filter; dot vs checkbox correctly signals single-choice vs toggle."
          shipped
        >
          <ConceptTwoPane viewVariant="radio" />
        </Variant>
        <Variant
          badge="2"
          title="Trailing tick"
          rationale="Same rows, but the active view is marked by a right-aligned check instead of a leading dot. Reads like a standard select menu; selection state is slightly less obvious at a glance."
        >
          <ConceptTwoPane viewVariant="tick" />
        </Variant>
        <Variant
          badge="3"
          title="Cards"
          rationale="List and By sprint as two compact cards. More visual weight for the primary choice, but tallest of the three and least like the other panes."
        >
          <ConceptTwoPane viewVariant="cards" />
        </Variant>
      </div>
    </div>
  );
}
