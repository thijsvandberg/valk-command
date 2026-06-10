"use client";

/**
 * Throwaway prototype: polishing the Recently viewed flip-view in the nav
 * panel (BRDG-330). The shipped v1 is a hairline list of full ticket pills,
 * which leaves little room for the one thing a human actually recognizes:
 * the title. Four directions below, each rendered inside a faithful mock of
 * the 360px nav panel so proportions are honest. Not linked from app nav.
 */

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  FlaskConical,
  ArrowUpRight,
  Eraser,
  Eye,
} from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { JIRA_STATUS_COLORS, JIRA_STATUS_ABBREVIATIONS } from "@/types/ticket";
import type { IssueType, JiraStatus } from "@/types/ticket";

// ---------------------------------------------------------------------------
// Mock data: realistic shapes and lengths, relative times pre-baked so the
// page renders deterministically.
// ---------------------------------------------------------------------------

type MockEntry = {
  key: string;
  title: string;
  type: IssueType;
  status: JiraStatus;
  ago: string;
  bucket: "Today" | "Yesterday" | "Earlier";
  current?: boolean;
};

const ENTRIES: MockEntry[] = [
  { key: "VPL-46304", title: "Research Valk Loyal SOAP security", type: "spike", status: "TEST", ago: "2m", bucket: "Today", current: true },
  { key: "VPL-46101", title: "Display strikethrough (original) price per rate in room results", type: "story", status: "TEST", ago: "18m", bucket: "Today" },
  { key: "VPL-43142", title: "Group Reservations", type: "epic", status: "IN PROGRESS", ago: "32m", bucket: "Today" },
  { key: "VPL-46337", title: "Expose most-expensive room in pricing feed", type: "story", status: "TO DO", ago: "1h", bucket: "Today" },
  { key: "VPL-45943", title: "Restrict booking calendar to group dates to group reservation date range/shoulder", type: "story", status: "TEST", ago: "2h", bucket: "Today" },
  { key: "VPL-45948", title: "Add and remove group codes manually in the bookingtool", type: "story", status: "IN PROGRESS", ago: "6h", bucket: "Today" },
  { key: "VPL-46360", title: "Check lowest price cron (on UAT)", type: "task", status: "IN PROGRESS", ago: "1d", bucket: "Yesterday" },
  { key: "VPL-29223", title: "Monitoring Kibana (PROD) & heartbeat channel", type: "task", status: "TO DO", ago: "1d", bucket: "Yesterday" },
  { key: "VPL-42510", title: "[Initial-sync] Implement initial restrictions sync", type: "bug", status: "TEST", ago: "2d", bucket: "Earlier" },
  { key: "VPL-36166", title: "Configurable maximum booking period per hotel (12-24 months)", type: "story", status: "IN PROGRESS", ago: "3d", bucket: "Earlier" },
];

type Fill = "full" | "few" | "empty";

const FILL_LABEL: Record<Fill, string> = {
  full: "Full (10)",
  few: "Few (3)",
  empty: "Empty",
};

function useEntries(fill: Fill): MockEntry[] {
  if (fill === "empty") return [];
  if (fill === "few") return ENTRIES.slice(0, 3);
  return ENTRIES;
}

// ---------------------------------------------------------------------------
// Shared atoms
// ---------------------------------------------------------------------------

function StatusChip({ status }: { status: JiraStatus }) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1 py-px font-mono text-[9px] font-semibold tracking-[0.04em]"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {JIRA_STATUS_ABBREVIATIONS[status]}
    </span>
  );
}

function KeyPill({ entry }: { entry: MockEntry }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-overlay-default px-1.5 py-0.5 ring-1 ring-border-subtle">
      <IssueTypeIcon type={entry.type} size={12} strokeWidth={1.75} />
      <span className="font-mono text-[11px] font-medium text-text-primary">{entry.key}</span>
      <StatusChip status={entry.status} />
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

function CurrentDot() {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-label="Currently open">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-brand-400)] opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
    </span>
  );
}

/** Faithful mock of the nav panel shell: 360px, floating surface, back header. */
function PanelShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="w-[360px] shrink-0 overflow-hidden rounded-2xl bg-[var(--color-surface-floating)]/95 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-border-strong backdrop-blur-2xl">
      <span className="pointer-events-none block h-px bg-gradient-to-r from-transparent via-[var(--color-brand-glow)] to-transparent" />
      <div className="relative p-3">
        <div className="group flex w-full cursor-pointer items-center gap-2 rounded-xl px-1.5 py-2 transition-colors duration-150 hover:bg-hover-list-item">
          <ChevronLeft className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.5} />
          <History className="h-[18px] w-[18px] shrink-0 text-text-tertiary" strokeWidth={1.5} />
          <span className="text-body-sm font-medium text-text-primary">Recently viewed</span>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

function ClearFooter({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="mt-1 flex items-center justify-between border-t border-border-subtle px-1.5 pt-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        Last {count} tickets
      </span>
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
// Variant A — shipped v1: pill-first hairline rows
// ---------------------------------------------------------------------------

function VariantA({ entries }: { entries: MockEntry[] }) {
  if (entries.length === 0) return <EmptyState />;
  return (
    <div className="flex flex-col px-1">
      {entries.map((e) => (
        <div
          key={e.key}
          role="button"
          tabIndex={0}
          className="group flex w-full cursor-pointer items-center gap-3 border-t border-border-subtle py-2.5 text-left transition-colors duration-150 first:border-t-0 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <KeyPill entry={e} />
          <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary transition-colors group-hover:text-text-primary">
            {e.title}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant B — title-first, two lines, grouped by day
// ---------------------------------------------------------------------------

function VariantB({ entries }: { entries: MockEntry[] }) {
  if (entries.length === 0) return <EmptyState />;
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
              <div
                key={e.key}
                role="button"
                tabIndex={0}
                className="group flex w-full cursor-pointer items-start gap-2.5 rounded-xl px-1.5 py-2 text-left transition-colors duration-150 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <span className="mt-0.5 shrink-0">
                  <IssueTypeIcon type={e.type} size={14} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-body-sm text-text-primary">{e.title}</span>
                    {e.current && <CurrentDot />}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-text-muted">{e.key}</span>
                    <StatusChip status={e.status} />
                    <span className="font-mono text-[10px] text-text-muted/70">{e.ago}</span>
                  </span>
                </span>
                <ChevronRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant C — numbered quick-switch, IDE recent-files density
// ---------------------------------------------------------------------------

function VariantC({ entries }: { entries: MockEntry[] }) {
  if (entries.length === 0) return <EmptyState />;
  return (
    <div className="flex flex-col px-1 pt-1">
      {entries.map((e, i) => (
        <div
          key={e.key}
          role="button"
          tabIndex={0}
          className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 py-[7px] text-left transition-colors duration-150 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <span className="grid h-4 w-4 shrink-0 place-items-center font-mono text-[10px] text-text-muted/60 transition-colors group-hover:text-[var(--color-brand-300)]">
            <span className="group-hover:hidden">{(i + 1) % 10}</span>
            <ArrowUpRight className="hidden h-3 w-3 group-hover:block" strokeWidth={1.75} />
          </span>
          <span className="shrink-0">
            <IssueTypeIcon type={e.type} size={13} strokeWidth={1.75} />
          </span>
          <span className="shrink-0 font-mono text-[11px] text-text-tertiary">{e.key.replace("VPL-", "")}</span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary transition-colors group-hover:text-text-primary">
            {e.title}
          </span>
          {e.current ? (
            <Eye className="h-3 w-3 shrink-0 text-[var(--color-brand-400)]" strokeWidth={1.75} />
          ) : (
            <span className="shrink-0 font-mono text-[10px] text-text-muted/60">{e.ago}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant D — status-rail cards
// ---------------------------------------------------------------------------

function VariantD({ entries }: { entries: MockEntry[] }) {
  if (entries.length === 0) return <EmptyState />;
  return (
    <div className="flex flex-col gap-1.5 px-1 pt-1">
      {entries.map((e) => {
        const c = JIRA_STATUS_COLORS[e.status];
        return (
          <div
            key={e.key}
            role="button"
            tabIndex={0}
            className="group relative flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl bg-overlay-default/60 py-2 pl-3 pr-2 text-left ring-1 ring-border-subtle transition-colors duration-150 hover:bg-hover-list-item hover:ring-border-default active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <span className="absolute inset-y-1 left-1 w-[3px] rounded-full" style={{ backgroundColor: c.text, opacity: 0.55 }} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate text-[12.5px] text-text-primary">{e.title}</span>
                {e.current && <CurrentDot />}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <IssueTypeIcon type={e.type} size={11} strokeWidth={1.75} />
                <span className="font-mono text-[10px] text-text-muted">{e.key}</span>
                <span className="font-mono text-[10px] text-text-muted/60">· {e.ago}</span>
              </span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type VariantDef = {
  id: string;
  name: string;
  thesis: string;
  render: (entries: MockEntry[]) => React.ReactNode;
  footer?: boolean;
};

const VARIANTS: VariantDef[] = [
  {
    id: "A",
    name: "Shipped v1 — pill first",
    thesis:
      "What is live today: the full ticket pill leads, title squeezes into what is left. Honest baseline; long titles lose.",
    render: (e) => <VariantA entries={e} />,
  },
  {
    id: "B",
    name: "Title first, grouped by day",
    thesis:
      "You recognize tickets by title, so the title owns the row; key, status and age step down to a meta line. Day groups give the list a memory shape: today, yesterday, earlier.",
    render: (e) => <VariantB entries={e} />,
    footer: true,
  },
  {
    id: "C",
    name: "Quick-switch",
    thesis:
      "IDE recent-files density: ten one-line rows, numbered for future cmd+1..9 shortcuts, key without the project prefix. The fastest list to scan, the least decorated.",
    render: (e) => <VariantC entries={e} />,
    footer: true,
  },
  {
    id: "D",
    name: "Status-rail cards",
    thesis:
      "Each entry is a soft card with a status-colored rail, so workflow state reads as color before you read a single word. Calmer, slightly more spacious.",
    render: (e) => <VariantD entries={e} />,
    footer: true,
  },
];

export default function RecentlyViewedExplorationPage() {
  const [fill, setFill] = useState<Fill>("full");
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
            Recently viewed — beyond the pill list
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            BRDG-330 shipped a working MRU list, but the full ticket pill eats the row and the title — the thing
            you actually recognize — gets ~15 characters. Four directions below, in the real 360px panel shell.
            Common upgrades shown across variants: relative age, a pulse on the ticket you are on right now,
            a friendlier empty state, and a quiet footer with a Clear action.
          </p>
        </header>

        {/* List state simulator */}
        <section className="mb-8 flex items-center gap-3 rounded-2xl bg-[var(--color-surface-floating)] p-4 ring-1 ring-border-default">
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
        </section>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 xl:grid-cols-2">
          {VARIANTS.map((v) => (
            <section key={v.id}>
              <div className="mb-3 max-w-[400px]">
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] font-semibold text-[var(--color-brand-400)]">{v.id}</span>
                  <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-text-primary">
                    {v.name}
                  </span>
                </p>
                <p className="mt-1 text-[12.5px] leading-[1.6] text-text-tertiary">{v.thesis}</p>
              </div>
              <PanelShell footer={v.footer ? <ClearFooter count={entries.length} /> : undefined}>
                {v.render(entries)}
              </PanelShell>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
