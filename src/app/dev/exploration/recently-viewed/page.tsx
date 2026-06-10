"use client";

/**
 * Throwaway prototype: polishing the Recently viewed flip-view in the nav
 * panel (BRDG-330). Constraint decided in review: every row keeps the REAL
 * TicketRefPill, because the pill carries the copy-URL / share interaction
 * (BRDG-327) for free. The exploration therefore compares row layouts around
 * the pill, an optional group-by-day list view, and replays the whole
 * interaction from the menu button onward. The mock keys are real tickets,
 * so the pills resolve live and their hover/copy behavior actually works
 * here. Not linked from app nav.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  FlaskConical,
  Eraser,
  Menu,
  MessageCircle,
  NotebookPen,
  Boxes,
  KanbanSquare,
} from "lucide-react";
import { TicketRefPill } from "@/components/shared/TicketRefPill";

// ---------------------------------------------------------------------------
// Mock data: real ticket keys (so the live pill resolves them), relative times
// pre-baked so the page renders deterministically.
// ---------------------------------------------------------------------------

type MockEntry = {
  key: string;
  title: string;
  ago: string;
  bucket: "Today" | "Yesterday" | "Earlier";
  current?: boolean;
};

const ENTRIES: MockEntry[] = [
  { key: "VPL-46304", title: "Research Valk Loyal SOAP security", ago: "2m", bucket: "Today", current: true },
  { key: "VPL-46101", title: "Display strikethrough (original) price per rate in room results", ago: "18m", bucket: "Today" },
  { key: "VPL-43142", title: "Group Reservations", ago: "32m", bucket: "Today" },
  { key: "VPL-46337", title: "Expose most-expensive room in pricing feed", ago: "1h", bucket: "Today" },
  { key: "VPL-45943", title: "Restrict booking calendar to group dates to group reservation date range/shoulder", ago: "2h", bucket: "Today" },
  { key: "VPL-45948", title: "Add and remove group codes manually in the bookingtool", ago: "6h", bucket: "Today" },
  { key: "VPL-46360", title: "Check lowest price cron (on UAT)", ago: "1d", bucket: "Yesterday" },
  { key: "VPL-29223", title: "Monitoring Kibana (PROD) & heartbeat channel", ago: "1d", bucket: "Yesterday" },
  { key: "VPL-42510", title: "[Initial-sync] Implement initial restrictions sync", ago: "2d", bucket: "Earlier" },
  { key: "VPL-36166", title: "Configurable maximum booking period per hotel (12-24 months)", ago: "3d", bucket: "Earlier" },
];

type Fill = "full" | "few" | "empty";
type RowLayout = "inline" | "titleFirst" | "pillFirst";

const FILL_LABEL: Record<Fill, string> = { full: "Full (10)", few: "Few (3)", empty: "Empty" };

const LAYOUTS: { id: RowLayout; label: string; thesis: string }[] = [
  {
    id: "inline",
    label: "A · Inline (shipped)",
    thesis: "Pill and title share one line. Compact, but long titles get ~15 characters.",
  },
  {
    id: "titleFirst",
    label: "B · Title first",
    thesis: "Title owns the first line because that is what you recognize; the pill steps down to a meta line and keeps its copy/share role.",
  },
  {
    id: "pillFirst",
    label: "C · Pill first",
    thesis: "Pill leads on its own line with the age beside it; the title gets the full second line. Key-oriented, still nothing truncated.",
  },
];

function useEntries(fill: Fill): MockEntry[] {
  if (fill === "empty") return [];
  if (fill === "few") return ENTRIES.slice(0, 3);
  return ENTRIES;
}

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

function CurrentDot() {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-label="Currently open">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-brand-400)] opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-overlay-default">
        <History className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
      </span>
      <p className="text-[12px] text-text-muted">No recently viewed tickets yet</p>
      <p className="max-w-[220px] text-[11px] leading-[1.6] text-text-muted/70">
        Tickets you open on the board, in refinement or on their page show up here.
      </p>
    </div>
  );
}

function ClearFooter({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="mt-1 flex items-center justify-between border-t border-border-subtle px-1.5 pt-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">Last {count} tickets</span>
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] text-text-muted transition-colors duration-150 hover:text-text-secondary active:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <Eraser className="h-3 w-3" strokeWidth={1.5} />
        Clear
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row layouts — every one keeps the real TicketRefPill (copy/share intact).
// Rows are role="button" (never anchors) because the pill nests its own <a>.
// ---------------------------------------------------------------------------

function Row({ entry, layout }: { entry: MockEntry; layout: RowLayout }) {
  const base =
    "group flex w-full cursor-pointer text-left transition-colors duration-150 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";

  if (layout === "inline") {
    return (
      <div role="button" tabIndex={0} className={`${base} items-center gap-3 border-t border-border-subtle py-2.5 first:border-t-0`}>
        <span className="shrink-0">
          <TicketRefPill ticketKey={entry.key} />
        </span>
        <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary transition-colors group-hover:text-text-primary">
          {entry.title}
        </span>
        {entry.current && <CurrentDot />}
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
      </div>
    );
  }

  if (layout === "titleFirst") {
    return (
      <div role="button" tabIndex={0} className={`${base} flex-col gap-1 rounded-xl px-1.5 py-2`}>
        <span className="flex w-full items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{entry.title}</span>
          {entry.current && <CurrentDot />}
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
        </span>
        <span className="flex w-full items-center gap-2">
          <TicketRefPill ticketKey={entry.key} />
          <span className="font-mono text-[10px] text-text-muted/70">{entry.ago}</span>
        </span>
      </div>
    );
  }

  // pillFirst
  return (
    <div role="button" tabIndex={0} className={`${base} flex-col gap-1 rounded-xl px-1.5 py-2`}>
      <span className="flex w-full items-center gap-2">
        <TicketRefPill ticketKey={entry.key} />
        <span className="font-mono text-[10px] text-text-muted/70">{entry.ago}</span>
        {entry.current && <CurrentDot />}
        <span className="flex-1" />
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
      </span>
      <span className="w-full truncate text-body-sm text-text-secondary transition-colors group-hover:text-text-primary">
        {entry.title}
      </span>
    </div>
  );
}

function RecentList({
  entries,
  layout,
  grouped,
}: {
  entries: MockEntry[];
  layout: RowLayout;
  grouped: boolean;
}) {
  if (entries.length === 0) return <EmptyState />;

  if (!grouped) {
    return (
      <div className="flex flex-col px-1">
        {entries.map((e) => (
          <Row key={e.key} entry={e} layout={layout} />
        ))}
      </div>
    );
  }

  const buckets = ["Today", "Yesterday", "Earlier"] as const;
  return (
    <div className="flex flex-col px-1">
      {buckets.map((bucket) => {
        const group = entries.filter((e) => e.bucket === bucket);
        if (group.length === 0) return null;
        return (
          <div key={bucket}>
            <p className="px-1.5 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted first:pt-1.5">
              {bucket}
            </p>
            {group.map((e) => (
              <Row key={e.key} entry={e} layout={layout} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel chrome mocks
// ---------------------------------------------------------------------------

function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[360px] shrink-0 overflow-hidden rounded-2xl bg-[var(--color-surface-floating)]/95 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-border-strong backdrop-blur-2xl">
      <span className="pointer-events-none block h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
      <div className="relative p-3">{children}</div>
    </div>
  );
}

function AccountHeaderMock() {
  return (
    <div className="mb-2 flex w-full items-center gap-3 rounded-2xl px-1.5 py-1.5">
      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[var(--color-brand-500)]/20 text-[11px] font-semibold tracking-wide text-[var(--color-brand-300)] ring-1 ring-[var(--color-brand-500)]/25">
        TB
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-body-sm font-medium text-text-primary">Thijs van den Berg</p>
        <p className="truncate text-[11px] text-text-tertiary">thijs@newstory.nl</p>
      </div>
      <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />
    </div>
  );
}

function RecentHeader({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="group flex w-full cursor-pointer items-center gap-2 rounded-xl px-1.5 py-2 text-left transition-colors duration-150 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      <ChevronLeft className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.5} />
      <History className="h-[18px] w-[18px] shrink-0 text-text-tertiary" strokeWidth={1.5} />
      <span className="text-body-sm font-medium text-text-primary">Recently viewed</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Interactive demo: the whole flow, starting at the menu button.
// ---------------------------------------------------------------------------

const NAV_ROWS = [
  { label: "Chat", icon: MessageCircle, count: "35", note: "unread" },
  { label: "Story Writer", icon: NotebookPen, count: "9", note: "drafts" },
  { label: "Refinement", icon: Boxes, count: "4", note: "to refine" },
];

function MenuFlowDemo({
  entries,
  layout,
  grouped,
}: {
  entries: MockEntry[];
  layout: RowLayout;
  grouped: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<"nav" | "recent">("recent");

  return (
    <div className="relative min-h-[760px] overflow-hidden rounded-2xl bg-[var(--color-surface-base)] ring-1 ring-border-default">
      {/* Mock app header */}
      <div className="flex items-center gap-3 border-b border-border-default bg-[var(--color-surface-elevated)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setView("nav"); }}
          aria-expanded={open}
          className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
            open ? "bg-overlay-default ring-1 ring-[var(--color-brand-400)]/40" : "hover:bg-hover-list-item"
          }`}
        >
          <Menu className="h-4 w-4 text-text-secondary" strokeWidth={1.75} />
          <span className="font-mono text-[17px] font-bold tracking-tight text-text-primary">bridge_</span>
        </button>
        <span className="h-5 w-px bg-border-default" />
        <span className="text-body-sm text-text-secondary">Sprint Board</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
          1 · menu &nbsp;&nbsp;2 · recently viewed &nbsp;&nbsp;3 · pick a ticket
        </span>
      </div>

      {/* Dropped panel, anchored under the menu button like the real NavPanel */}
      {open && (
        <div className="absolute left-4 top-[58px] z-10">
          <PanelChrome>
            <AccountHeaderMock />
            {view === "nav" ? (
              <>
                {/* Sprint Board hero, abbreviated */}
                <div className="group mb-1 flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-2 py-2.5 transition-colors duration-150 hover:bg-hover-list-item">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--color-brand-500)] text-white shadow-[0_6px_20px_var(--color-brand-glow)]">
                    <KanbanSquare className="h-[22px] w-[22px]" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[18px] font-semibold tracking-[-0.02em] text-text-primary">Sprint Board</p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">7 to do &middot; 5 in progress &middot; 2 done</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-text-muted" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col px-1">
                  {NAV_ROWS.map(({ label, icon: Icon, count, note }) => (
                    <div key={label} className="group flex cursor-pointer items-center gap-3 border-t border-border-subtle py-3 transition-colors duration-150 first:border-t-0">
                      <Icon className="h-[18px] w-[18px] shrink-0 text-text-tertiary" strokeWidth={1.5} />
                      <span className="flex-1 text-body-sm text-text-secondary">{label}</span>
                      <span className="font-display text-[15px] font-semibold tabular-nums text-text-secondary">{count}</span>
                      <span className="w-20 text-right text-[11px] text-text-muted">{note}</span>
                    </div>
                  ))}
                </div>
                <div className="px-1">
                  <button
                    type="button"
                    onClick={() => setView("recent")}
                    className="group flex w-full cursor-pointer items-center gap-3 border-t border-border-subtle py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    <History className="h-[18px] w-[18px] shrink-0 text-text-tertiary transition-colors group-hover:text-text-secondary" strokeWidth={1.5} />
                    <span className="flex-1 text-body-sm text-text-secondary transition-colors group-hover:text-text-primary">Recently viewed</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.5} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <RecentHeader onBack={() => setView("nav")} />
                <RecentList entries={entries} layout={layout} grouped={grouped} />
                <ClearFooter count={entries.length} />
              </>
            )}
          </PanelChrome>
        </div>
      )}

      {/* Faint board rows behind, for depth */}
      <div className="pointer-events-none select-none px-6 pt-6 opacity-30" aria-hidden>
        {ENTRIES.slice(0, 9).map((e) => (
          <div key={e.key} className="flex items-center gap-3 border-b border-border-subtle py-3">
            <span className="font-mono text-[11px] text-text-muted">{e.key}</span>
            <span className="truncate text-body-sm text-text-tertiary">{e.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RecentlyViewedExplorationPage() {
  const [fill, setFill] = useState<Fill>("full");
  const [layout, setLayout] = useState<RowLayout>("titleFirst");
  const [grouped, setGrouped] = useState(true);
  const entries = useEntries(fill);

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[1180px]">
        <header className="mb-8">
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
            /dev/exploration/recently-viewed
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Recently viewed — pills kept, layout explored
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Constraint from review: every row keeps the <strong className="text-text-primary">real ticket pill</strong>,
            because the pill already carries the copy-URL / share interaction. So the question is purely layout:
            where does the pill sit so the title stops truncating? The demo below replays the whole flow from the
            menu button; the pills are live, so hover cards and the pill&apos;s own click behavior work right here.
          </p>
        </header>

        {/* Controls */}
        <section className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-[var(--color-surface-floating)] p-4 ring-1 ring-border-default">
          <div className="flex items-center gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Row layout</p>
            <div className="flex gap-1">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLayout(l.id)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    layout === l.id
                      ? "bg-[var(--color-brand-600)]/15 font-medium text-[var(--color-brand-300)]"
                      : "text-text-secondary hover:bg-hover-list-item hover:text-text-primary"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Group by day</p>
            <button
              type="button"
              role="switch"
              aria-checked={grouped}
              onClick={() => setGrouped((v) => !v)}
              className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                grouped ? "bg-[var(--color-brand-500)]" : "bg-overlay-default ring-1 ring-border-default"
              }`}
            >
              <span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150"
                style={{ transform: grouped ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">List state</p>
            <div className="flex gap-1">
              {(Object.keys(FILL_LABEL) as Fill[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFill(f)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-[12px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    fill === f
                      ? "bg-[var(--color-brand-600)]/15 font-medium text-[var(--color-brand-300)]"
                      : "text-text-secondary hover:bg-hover-list-item hover:text-text-primary"
                  }`}
                >
                  {FILL_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <p className="mb-3 max-w-2xl text-[12.5px] leading-[1.6] text-text-tertiary">
          {LAYOUTS.find((l) => l.id === layout)!.thesis}
        </p>

        {/* The full interaction, from the menu button */}
        <MenuFlowDemo entries={entries} layout={layout} grouped={grouped} />

        {/* Side-by-side compare of the three row layouts */}
        <h2 className="mb-1 mt-12 font-display text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
          Side by side
        </h2>
        <p className="mb-5 max-w-2xl text-[12.5px] leading-[1.6] text-text-tertiary">
          Same data, same shell, only the row anatomy changes. Group-by-day and list state follow the controls above.
        </p>
        <div className="flex flex-wrap items-start gap-6">
          {LAYOUTS.map((l) => (
            <div key={l.id}>
              <p className="mb-2 px-1 font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">{l.label}</p>
              <PanelChrome>
                <RecentHeader onBack={() => {}} />
                <RecentList entries={entries} layout={l.id} grouped={grouped} />
                <ClearFooter count={entries.length} />
              </PanelChrome>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
