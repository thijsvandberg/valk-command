"use client";

/**
 * Inbox counts + checkbox-alignment exploration (/dev/exploration/inbox-counts).
 *
 * Two things the PO flagged on the real inbox:
 *   1. The group-header "select all" checkbox and the row checkboxes don't sit on
 *      one clean vertical line (the header checkbox is a w-5 button at px-3, the
 *      row checkbox a w-3.5 gutter at pl-4). "Today" vs "Aligned" cards, with a
 *      guide line, show the fix: both checkbox glyphs share the same x.
 *   2. The `9 · 4 new` count pills are not clear / pretty / usable, and the PO
 *      wants to filter AND select from there. Three header treatments, each live:
 *      click All/New to filter the mock list, Select-all to check the shown set.
 *
 * Self-contained styling sandbox; nothing is wired to the real app.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Bug, Bookmark, SquareCheckBig } from "lucide-react";
import { Checkbox } from "@/components/shared/Checkbox";
import { GROUP_CARD_CLASS } from "@/components/sprint-board/GroupCard";

type IssueType = "story" | "bug" | "task";
interface Row {
  key: string;
  title: string;
  type: IssueType;
  isNew: boolean;
}

// 9 unread, 4 new — the PO's real numbers.
const ROWS: Row[] = [
  { key: "VPL-471", title: "Add export to CSV", type: "story", isNew: true },
  { key: "VPL-470", title: "Room categories required fields", type: "bug", isNew: true },
  { key: "VPL-468", title: "Implement pnpm in valk-nx repo", type: "task", isNew: true },
  { key: "VPL-465", title: "Lunchpackage in Corporate BT", type: "story", isNew: true },
  { key: "VPL-461", title: "Fix login redirect loop", type: "bug", isNew: false },
  { key: "VPL-458", title: "Add text to payment method codes", type: "task", isNew: false },
  { key: "VPL-455", title: "Tidy epic colors", type: "story", isNew: false },
  { key: "VPL-450", title: "Update postcode-gateway", type: "task", isNew: false },
  { key: "VPL-447", title: "Bynder fotobeheer implementatie", type: "story", isNew: false },
];
const TOTAL = ROWS.length;
const NEW_COUNT = ROWS.filter((r) => r.isNew).length;

function IssueIcon({ type }: { type: IssueType }) {
  if (type === "bug") return <Bug className="h-3.5 w-3.5 shrink-0 text-[var(--color-status-error)]" strokeWidth={1.75} />;
  if (type === "task") return <SquareCheckBig className="h-3.5 w-3.5 shrink-0 text-[var(--color-icon-task,#5b8def)]" strokeWidth={1.75} />;
  return <Bookmark className="h-3.5 w-3.5 shrink-0 text-[var(--color-status-done,#3fae7a)]" strokeWidth={1.75} />;
}

// The BRDG-434 "new since" dot, reproduced.
function NewDot() {
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]"
      style={{ boxShadow: "0 0 0 2.5px color-mix(in srgb, var(--color-brand-500) 16%, transparent)" }}
    />
  );
}

// A faithful inbox row: pl-4 + a w-3.5 checkbox gutter + the w-2 new-dot slot +
// the issue icon + key + title. Matches BoardRow's leading anatomy.
function MockRow({ row, checked, onToggle }: { row: Row; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 py-[7px] pl-4 pr-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-3.5 shrink-0 cursor-pointer items-center justify-center"
        aria-label={`Select ${row.key}`}
      >
        <Checkbox checked={checked} />
      </button>
      <span className="flex w-2 shrink-0 items-center justify-center">{row.isNew && <NewDot />}</span>
      <IssueIcon type={row.type} />
      <span className="shrink-0 text-body-sm tabular-nums text-text-tertiary">{row.key}</span>
      <span className="min-w-0 truncate text-body-lg text-text-primary">{row.title}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — checkbox alignment
// ---------------------------------------------------------------------------

const ALIGN_ROWS = ROWS.slice(0, 3);

// "Today": the header select-all is a w-5 button at the card's px-3 inset, while
// the rows use a w-3.5 gutter at pl-4 — the glyphs land ~1px apart and the column
// reads ragged.
function TodayCard() {
  return (
    <div className={GROUP_CARD_CLASS}>
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border-subtle bg-surface-chrome/30 px-3 py-[9px]">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded">
          <Checkbox checked />
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={1.5} />
        <span className="text-body-sm font-semibold text-text-secondary">From your teammates</span>
      </div>
      {ALIGN_ROWS.map((r) => (
        <MockRow key={r.key} row={r} checked onToggle={() => {}} />
      ))}
    </div>
  );
}

// "Aligned": the header content uses the SAME pl-4 inset and a w-3.5 checkbox
// gutter as the rows, so both checkbox glyphs share one x. (The chevron moves into
// the dot slot's lane, keeping the label aligned with the issue icons too.)
function AlignedCard() {
  return (
    <div className={GROUP_CARD_CLASS}>
      <div className="flex items-center gap-2 rounded-t-xl border-b border-border-subtle bg-surface-chrome/30 py-[9px] pl-4 pr-3">
        <span className="flex w-3.5 shrink-0 items-center justify-center">
          <Checkbox checked />
        </span>
        <span className="flex w-2 shrink-0 items-center justify-center">
          <ChevronDown className="h-3 w-3 shrink-0 text-text-tertiary" strokeWidth={1.5} />
        </span>
        <span className="text-body-sm font-semibold text-text-secondary">From your teammates</span>
      </div>
      {ALIGN_ROWS.map((r) => (
        <MockRow key={r.key} row={r} checked onToggle={() => {}} />
      ))}
    </div>
  );
}

function AlignmentSection() {
  const [guide, setGuide] = useState(true);
  // Guide x = card content-left + pl-4 (16) + half of the 14px glyph (7) = 23px.
  return (
    <section className="mb-12">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold tracking-[-0.01em] text-text-primary">
          1 · Checkbox alignment
        </h2>
        <button
          type="button"
          onClick={() => setGuide((v) => !v)}
          className="rounded-md px-2 py-1 text-label font-medium text-text-tertiary ring-1 ring-border-default transition-colors hover:text-text-secondary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
        >
          {guide ? "Hide" : "Show"} guide line
        </button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {[
          { label: "Today — ragged", node: <TodayCard /> },
          { label: "Aligned — one column", node: <AlignedCard /> },
        ].map((col) => (
          <div key={col.label}>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">{col.label}</p>
            <div className="relative">
              {guide && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-[var(--color-brand-400)]/60"
                  style={{ left: "23px" }}
                />
              )}
              {col.node}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — header count / filter / select control
// ---------------------------------------------------------------------------

function MockList({ newOnly, checked, onToggle }: { newOnly: boolean; checked: Set<string>; onToggle: (k: string) => void }) {
  const shown = (newOnly ? ROWS.filter((r) => r.isNew) : ROWS).slice(0, 5);
  return (
    <div className={`${GROUP_CARD_CLASS} mt-3`}>
      {shown.map((r) => (
        <MockRow key={r.key} row={r} checked={checked.has(r.key)} onToggle={() => onToggle(r.key)} />
      ))}
    </div>
  );
}

// Each variant owns its own filter + selection state so all three can be tried
// independently on the page.
function VariantDemo({
  title,
  blurb,
  recommended,
  control,
}: {
  title: string;
  blurb: string;
  recommended?: boolean;
  control: (s: {
    newOnly: boolean;
    setNewOnly: (v: boolean) => void;
    shownKeys: string[];
    checked: Set<string>;
    selectAll: () => void;
    allChecked: boolean;
  }) => React.ReactNode;
}) {
  const [newOnly, setNewOnly] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const shownKeys = (newOnly ? ROWS.filter((r) => r.isNew) : ROWS).slice(0, 5).map((r) => r.key);
  const allChecked = shownKeys.length > 0 && shownKeys.every((k) => checked.has(k));
  const selectAll = () => setChecked(allChecked ? new Set() : new Set(shownKeys));
  const onToggle = (k: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  return (
    <div className="rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h3>
        {recommended && (
          <span className="rounded-full bg-[var(--color-brand-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-300)]">
            Recommended
          </span>
        )}
      </div>
      <p className="mb-4 text-body-sm leading-[1.6] text-text-tertiary">{blurb}</p>
      <div className="rounded-xl bg-[var(--color-surface-base)] p-4 ring-1 ring-border-subtle">
        {control({ newOnly, setNewOnly, shownKeys, checked, selectAll, allChecked })}
        <MockList newOnly={newOnly} checked={checked} onToggle={onToggle} />
      </div>
    </div>
  );
}

const TITLE = "font-display text-[20px] font-semibold tracking-[-0.02em] text-text-primary";

export default function InboxCountsExploration() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[920px]">
        <Link
          href="/dev/exploration"
          className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-tertiary transition-colors hover:text-text-secondary cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          All explorations
        </Link>
        <header className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/inbox-counts
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Inbox counts &amp; checkbox alignment
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Two fixes for the inbox: line the group-header and row checkboxes into one clean column, and
            replace the unclear <span className="text-text-primary">9 · 4 new</span> pills with a control
            that makes filtering <em>and</em> selecting obvious. Everything below is interactive.
          </p>
        </header>

        <AlignmentSection />

        <section>
          <h2 className="mb-1 font-display text-[18px] font-semibold tracking-[-0.01em] text-text-primary">
            2 · Count, filter &amp; select
          </h2>
          <p className="mb-5 text-body-sm leading-[1.6] text-text-tertiary">
            Current header for reference, then three directions. Click All / New to filter the list;
            Select-all checks exactly what is shown.
          </p>

          {/* Current, for reference */}
          <div className="mb-6 rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
            <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">Today (shipped)</h3>
            <div className="flex items-center">
              <span className={TITLE}>Inbox</span>
              <span className="ml-2 rounded-full bg-overlay-subtle px-2 py-0.5 text-label tabular-nums text-text-tertiary">
                {TOTAL}
              </span>
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-subtle)] px-2 py-0.5 text-label font-medium tabular-nums text-[var(--color-brand-300)]">
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                {NEW_COUNT} new
              </span>
            </div>
          </div>

          <div className="grid gap-4">
            {/* A — Segmented + Select all */}
            <VariantDemo
              title="A · Segmented All / New + Select all"
              recommended
              blurb="One segmented switch makes the filter obvious (active segment filled); a Select-all sits right beside it and checks the shown set. Filter + select in one place."
              control={({ newOnly, setNewOnly, shownKeys, selectAll, allChecked }) => (
                <div className="flex flex-wrap items-center gap-3">
                  <span className={TITLE}>Inbox</span>
                  <div className="inline-flex items-center rounded-full bg-overlay-subtle p-0.5 text-label font-medium">
                    <button
                      type="button"
                      onClick={() => setNewOnly(false)}
                      className={`rounded-full px-2.5 py-1 tabular-nums transition-colors cursor-pointer ${
                        !newOnly ? "bg-surface-floating text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"
                      }`}
                    >
                      All {TOTAL}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewOnly(true)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 tabular-nums transition-colors cursor-pointer ${
                        newOnly ? "bg-[var(--color-brand-500)] text-white" : "text-[var(--color-brand-300)] hover:bg-[var(--color-brand-subtle)]"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${newOnly ? "bg-white" : "bg-current"}`} />
                      New {NEW_COUNT}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-label font-medium text-text-secondary ring-1 ring-border-default transition-colors hover:bg-overlay-default cursor-pointer"
                  >
                    <Checkbox checked={allChecked} indeterminate={!allChecked && false} />
                    Select all{newOnly ? " new" : ""}
                    <span className="text-text-muted">({shownKeys.length})</span>
                  </button>
                </div>
              )}
            />

            {/* B — Filter tabs only */}
            <VariantDemo
              title="B · Filter tabs (select stays on the rows)"
              blurb="Two underline tabs (like the board's view bar): All / New, active one underlined in brand. Selecting stays on the row + group checkboxes and the bulk bar — less in the header."
              control={({ newOnly, setNewOnly }) => (
                <div className="flex items-end gap-4">
                  <span className={TITLE}>Inbox</span>
                  {[
                    { label: `All ${TOTAL}`, on: !newOnly, set: () => setNewOnly(false), dot: false },
                    { label: `New ${NEW_COUNT}`, on: newOnly, set: () => setNewOnly(true), dot: true },
                  ].map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={t.set}
                      className={`relative inline-flex items-center gap-1.5 pb-1.5 text-body-sm font-medium tabular-nums transition-colors cursor-pointer ${
                        t.on ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
                      }`}
                    >
                      {t.dot && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />}
                      {t.label}
                      {t.on && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[var(--color-brand-400)]" />}
                    </button>
                  ))}
                </div>
              )}
            />

            {/* C — Labelled counts + explicit action */}
            <VariantDemo
              title="C · Labelled counts + Select all new"
              blurb="Keeps two readable counts (9 unread · 4 new, the new one clickable to filter) and adds one explicit action button that selects all new at once."
              control={({ newOnly, setNewOnly, shownKeys, selectAll, allChecked }) => (
                <div className="flex flex-wrap items-center gap-3">
                  <span className={TITLE}>Inbox</span>
                  <span className="text-body-sm tabular-nums text-text-tertiary">{TOTAL} unread</span>
                  <span className="text-text-muted">·</span>
                  <button
                    type="button"
                    onClick={() => setNewOnly(!newOnly)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-body-sm font-medium tabular-nums transition-colors cursor-pointer ${
                      newOnly ? "bg-[var(--color-brand-500)] text-white" : "text-[var(--color-brand-300)] hover:bg-[var(--color-brand-subtle)]"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${newOnly ? "bg-white" : "bg-current"}`} />
                    {NEW_COUNT} new
                  </button>
                  <button
                    type="button"
                    onClick={selectAll}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--color-brand-subtle)] px-2.5 py-1 text-label font-medium text-[var(--color-brand-300)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand-500)_18%,transparent)] cursor-pointer"
                  >
                    <Checkbox checked={allChecked} />
                    {allChecked ? "Clear" : `Select all ${shownKeys.length} new`}
                  </button>
                </div>
              )}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
