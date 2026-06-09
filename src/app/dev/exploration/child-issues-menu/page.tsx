"use client";

/**
 * Throwaway exploration: redesign of the consolidated Child-Issues header menu
 * (today the single "..." menu built in ChildIssueListHeader.tsx).
 *
 * Direction C (two-pane: category rail + content) was chosen. The open question
 * is the VIEW pane: in the first pass it used a segmented List/By-sprint toggle
 * plus a Planning checkbox, which looked unlike the row-based Filter and Columns
 * panes. The three panels below keep the C shell identical and only vary how the
 * VIEW pane is presented, so it reads as uniform with the rest:
 *
 *   1  Radio rows   - List / By sprint as selectable rows with a leading radio dot.
 *   2  Trailing tick - same rows, selection shown by a right-aligned check.
 *   3  Cards         - List / By sprint as two stacked selectable cards.
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
const DIVIDER = "h-px bg-border-subtle";
const ROW = "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-[7px] text-body-sm hover:bg-hover-list-item";

// Delegates to the shared canonical Checkbox so this reference page stays in sync.
function CheckBox({ on }: { on: boolean }) {
  return <Checkbox checked={on} />;
}

// Delegates to the shared canonical Radio so this reference page stays in sync.
function RadioDot({ on }: { on: boolean }) {
  return <Radio checked={on} />;
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

/* -------------------------------------------------------- the VIEW pane -- */

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

/* ----------------------------------------------------- two-pane concept -- */

function ConceptTwoPane({ viewVariant }: { viewVariant: ViewVariant }) {
  const [view, setView] = useState<ViewMode>("sprint");
  const [planning, setPlanning] = useState(true);
  const [status, setStatus] = useState<StatusKey>("all");
  const [hideDeprecated, setHideDeprecated] = useState(true);
  const [visible, setVisible] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const [pane, setPane] = useState<"view" | "filter" | "columns">("view");

  const toggleCol = (id: string) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
                <button key={c.id} onClick={() => toggleCol(c.id)} className={ROW}>
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

function Variant({
  badge,
  title,
  rationale,
  children,
}: {
  badge: string;
  title: string;
  rationale: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--color-brand-500)]/[0.12] text-caption font-bold text-[var(--color-brand-400)]">
          {badge}
        </span>
        <span className="text-body font-semibold text-text-primary">{title}</span>
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

      <h1 className="text-heading font-semibold text-text-primary">Two-pane menu &mdash; View pane presentation</h1>
      <p className="mt-2 max-w-[720px] text-body-sm leading-[1.7] text-text-muted">
        Concept C is the chosen shell. The View pane previously mixed a segmented toggle with a checkbox, which looked
        unlike the row-based Filter and Columns panes. Below, the shell is identical &mdash; only the View pane changes,
        so List / By sprint reads as part of the same vertical list. All three open on the View pane; click the rail to
        compare with Filter and Columns.
      </p>

      <div className="mt-10 flex flex-wrap items-start gap-x-14 gap-y-12">
        <Variant
          badge="1"
          title="Radio rows"
          rationale="List and By sprint become selectable rows with a leading radio dot, sitting directly above the Planning checkbox. Same row rhythm as Filter; the dot vs checkbox correctly signals single-choice vs toggle."
        >
          <ConceptTwoPane viewVariant="radio" />
        </Variant>

        <Variant
          badge="2"
          title="Trailing tick"
          rationale="The same rows, but the active view is marked by a right-aligned check instead of a leading dot. Cleanest, reads like a standard select menu; selection state is slightly less obvious at a glance."
        >
          <ConceptTwoPane viewVariant="tick" />
        </Variant>

        <Variant
          badge="3"
          title="Cards"
          rationale="List and By sprint as two compact cards with their icon. More visual weight for the primary choice, keeps Planning as a row below. Tallest of the three and least like the other panes."
        >
          <ConceptTwoPane viewVariant="cards" />
        </Variant>
      </div>
    </div>
  );
}
