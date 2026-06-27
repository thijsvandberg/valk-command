"use client";

/**
 * Throwaway exploration for BRDG-414 follow-up: the status-change "update line" beneath a
 * board row reads ambiguously — does it belong to the row above or below? This page trials
 * ways to visually bind the line to its (parent = above) row, plus a gallery of icons for the
 * header notification toggle and an optional per-line mute toggle.
 *
 * Reachable at /dev/exploration/status-change-linking; not linked from app nav. Nothing is
 * wired — actions are static; this is purely about the visual binding + icon choice.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellDot,
  BellOff,
  BellRing,
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  CornerDownRight,
  Eye,
  EyeOff,
  FlaskConical,
  GitBranch,
  History as HistoryIcon,
  Inbox,
  Info,
  ListChecks,
  Megaphone,
  MegaphoneOff,
  MessageSquare,
  MessageSquareOff,
  Rocket,
  Sparkles,
} from "lucide-react";
import type { Assignee, IssueType, JiraStatus } from "@/types/ticket";
import { JIRA_STATUS_ABBREVIATIONS, JIRA_STATUS_COLORS } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { Tooltip } from "@/components/shared/Tooltip";

/* -------------------------------------------------------------------- data -- */

const DAVID: Assignee = { name: "David Kingma", initials: "DK", color: "#5b8def" };
const FRANK: Assignee = { name: "Frank van den Nouland", initials: "FV", color: "#8a63d2" };

type Change = {
  from: JiraStatus;
  to: JiraStatus;
  by?: Assignee; // shown only when different from the row assignee
  when: string;
  deploy?: { env: string; failed?: boolean };
  pipeline?: { fails: number; total: number };
  openSubtasks?: number;
};

type Row = { key: string; title: string; type: IssueType; status: JiraStatus; epic?: string; change?: Change };

const ROWS: Row[] = [
  {
    key: "VPL-46123", title: "Migrate bookingtool to standalone components", type: "story", status: "TEST", epic: "Tech: General improvements",
    change: { from: "IN PROGRESS", to: "TEST", when: "4d ago", deploy: { env: "UAT3" }, pipeline: { fails: 4, total: 10 } },
  },
  { key: "VPL-45607", title: "Improve (DLQ) flow for payments on CX reservations", type: "story", status: "IN PROGRESS" },
  {
    key: "VPL-46432", title: "Check and fix bookable setting for room categories", type: "story", status: "TEST", epic: "Accommodation types",
    change: { from: "IN PROGRESS", to: "TEST", by: DAVID, when: "6h ago" },
  },
  { key: "VPL-46530", title: "Create /month endpoint in ARI query service", type: "story", status: "TO DO" },
  {
    key: "VPL-46531", title: "ARI /dates endpoint production testable", type: "story", status: "DONE", epic: "ARI",
    change: { from: "IN PROGRESS", to: "DONE", by: FRANK, when: "3h ago", openSubtasks: 2 },
  },
];

const STATUS_LABEL: Record<JiraStatus, string> = {
  "TO DO": "To Do", "IN PROGRESS": "In Progress", TEST: "Test", DONE: "Done", DEPRECATED: "Deprecated",
};

/* -------------------------------------------------------------- primitives -- */

function StatusPill({ row }: { row: Row }) {
  const c = JIRA_STATUS_COLORS[row.status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface-elevated px-1.5 py-[3px] ring-1 ring-inset ring-border-subtle shadow-[0_1px_2px_rgba(0,0,0,0.14)]">
      <IssueTypeIcon type={row.type} size={15} strokeWidth={2} />
      <span className="font-mono text-label font-medium leading-none text-text-primary">{row.key}</span>
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide" style={{ backgroundColor: c.bg, color: c.text }}>
        <span className="h-1.5 w-1.5 rounded-full opacity-70" style={{ backgroundColor: c.text }} />
        {JIRA_STATUS_ABBREVIATIONS[row.status]}
      </span>
    </span>
  );
}

function StatusWord({ status }: { status: JiraStatus }) {
  return <span className="font-medium text-text-secondary">{STATUS_LABEL[status]}</span>;
}

const SIGNAL = "inline-flex items-center gap-1 text-caption font-medium";
const ACTION_BTN =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-caption font-medium text-text-secondary";

// The update-line content (without the wrapper that does the linking).
function UpdateContent({ change, assignee, leading, perLineToggle }: { change: Change; assignee?: Assignee; leading?: ReactNode; perLineToggle?: boolean }) {
  const isFinished = change.to === "DONE" || change.to === "DEPRECATED";
  const isTest = change.to === "TEST";
  const showBy = change.by && change.by.name !== assignee?.name;
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
      {leading}
      <span className="text-caption text-text-tertiary">
        Updated from <StatusWord status={change.from} /> to <StatusWord status={change.to} />
        {showBy && (
          <>
            {" by "}
            <span className="inline-flex items-center gap-1 align-middle">
              <Avatar assignee={change.by!} size={14} />
              <span className="font-medium text-text-secondary">{change.by!.name}</span>
            </span>
          </>
        )}
      </span>
      <span className="text-text-muted">&middot;</span>
      <span className="inline-flex items-center gap-1 text-caption text-text-muted">
        <Clock className="h-3 w-3" strokeWidth={1.75} />
        {change.when}
      </span>
      {change.deploy && (
        <>
          <span className="text-text-muted">&middot;</span>
          <span className={`${SIGNAL} ${change.deploy.failed ? "text-red-500" : "text-emerald-500"}`}>
            <Rocket className="h-3 w-3" strokeWidth={2} />
            {change.deploy.env}
          </span>
        </>
      )}
      {change.pipeline && (
        <span className={`${SIGNAL} ${change.pipeline.fails > 0 ? "text-red-500" : "text-emerald-500"}`}>
          <GitBranch className="h-3 w-3" strokeWidth={2} />
          {change.pipeline.fails}/{change.pipeline.total} failed
        </span>
      )}
      {isFinished && change.openSubtasks ? (
        <>
          <span className="text-text-muted">&middot;</span>
          <span className={`${SIGNAL} text-amber-500`}>
            <ListChecks className="h-3 w-3" strokeWidth={1.75} />
            {change.openSubtasks} open
          </span>
        </>
      ) : null}

      <span className="ml-auto flex items-center gap-1.5">
        {isFinished && (
          <span className={ACTION_BTN}>
            <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.75} />
            Move to bottom
          </span>
        )}
        {isTest && (
          <span className={`${ACTION_BTN} opacity-60`}>
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
            Generate test prompt
          </span>
        )}
        {perLineToggle && (
          <Tooltip content="Mute updates for this ticket">
            <span className="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-overlay-default">
              <BellOff className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
          </Tooltip>
        )}
        <span className="grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-overlay-default" title="Mark as seen">
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- treatments -- */

type Treatment = "connector" | "card" | "rail" | "tight" | "caption";

const TREATMENTS: { id: Treatment; label: string; blurb: string }[] = [
  { id: "connector", label: "A · Connector", blurb: "A small elbow branches from the parent row's gutter into the line — an explicit tree-style child." },
  { id: "card", label: "B · Shared surface", blurb: "The row and its line share one subtle rounded surface; the next row is a separate surface. Grouping does the binding." },
  { id: "rail", label: "C · Left rail", blurb: "A short accent bar on the left spans the row + its line, bracketing the pair together." },
  { id: "tight", label: "D · Tight + divider", blurb: "The line is glued to the row above (no separating border) and a clear divider sits before the NEXT row, so the gap belongs below." },
  { id: "caption", label: "E · Caption indent", blurb: "The line is indented under the title with a ↳ marker and muted, reading as a caption of the row above." },
];

// One row + (optional) its update line, bound per the chosen treatment.
function RowBlock({ row, treatment, perLineToggle, isLast }: { row: Row; treatment: Treatment; perLineToggle: boolean; isLast: boolean }) {
  const rowInner = (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-overlay-strong" />
      <StatusPill row={row} />
      <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{row.title}</span>
      {row.epic && (
        <span className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-caption text-[var(--meta-epic-fg,var(--color-brand-300))] ring-1 ring-inset ring-border-subtle lg:inline-flex">
          {row.epic}
        </span>
      )}
      <Avatar assignee={row.status === "DONE" ? FRANK : DAVID} size={20} />
    </div>
  );

  if (!row.change) {
    return (
      <div className={treatment === "card" ? "overflow-hidden rounded-lg ring-1 ring-border-subtle" : ""}>
        {rowInner}
        {!isLast && treatment !== "card" && <div className="mx-3 h-px bg-border-subtle/60" />}
      </div>
    );
  }

  // ---- changed row: row + bound line, per treatment ----
  if (treatment === "card") {
    return (
      <div className="overflow-hidden rounded-lg bg-[var(--color-surface-elevated)]/40 ring-1 ring-border-subtle">
        {rowInner}
        <div className="flex items-center gap-2 border-t border-border-subtle/60 bg-[var(--color-surface-base)]/30 px-3 py-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />
          <UpdateContent change={row.change} assignee={row.status === "DONE" ? FRANK : DAVID} perLineToggle={perLineToggle} />
        </div>
      </div>
    );
  }

  if (treatment === "rail") {
    return (
      <div className="my-1 border-l-2 border-l-[var(--color-brand-400)]/45">
        {rowInner}
        <div className="flex items-center gap-2 py-1.5 pl-3 pr-3">
          <Info className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />
          <UpdateContent change={row.change} assignee={row.status === "DONE" ? FRANK : DAVID} perLineToggle={perLineToggle} />
        </div>
      </div>
    );
  }

  if (treatment === "connector") {
    return (
      <div>
        {rowInner}
        <div className="flex items-center gap-1 py-1 pl-5 pr-3">
          {/* elbow */}
          <span className="mb-2 h-3 w-4 shrink-0 rounded-bl-[6px] border-b border-l border-border-strong" />
          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />
          <UpdateContent change={row.change} assignee={row.status === "DONE" ? FRANK : DAVID} perLineToggle={perLineToggle} />
        </div>
        {!isLast && <div className="mx-3 mt-1 h-px bg-border-subtle/60" />}
      </div>
    );
  }

  if (treatment === "tight") {
    return (
      <div className="mb-1">
        {rowInner}
        {/* glued to the row above: no top border, slight pull-up */}
        <div className="-mt-1 flex items-center gap-2 px-3 pb-1 pl-12">
          <UpdateContent change={row.change} assignee={row.status === "DONE" ? FRANK : DAVID} perLineToggle={perLineToggle} />
        </div>
        {!isLast && <div className="mx-3 mt-1 h-px bg-border-strong/50" />}
      </div>
    );
  }

  // caption
  return (
    <div>
      {rowInner}
      <div className="flex items-center gap-1.5 pb-1.5 pl-12 pr-3 text-text-muted">
        <span className="text-text-muted">&#8627;</span>
        <UpdateContent change={row.change} assignee={row.status === "DONE" ? FRANK : DAVID} perLineToggle={perLineToggle} />
      </div>
      {!isLast && <div className="mx-3 h-px bg-border-subtle/60" />}
    </div>
  );
}

function BoardSlice({ treatment, perLineToggle }: { treatment: Treatment; perLineToggle: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-floating)]/40 ${treatment === "card" || treatment === "rail" ? "p-2" : ""}`}>
      <div className="mb-1 flex items-center gap-2 border-b border-border-strong bg-[var(--color-surface-elevated)]/60 px-3 py-2">
        <span className="text-body-sm font-semibold text-text-primary">BT: 140</span>
        <span className="rounded-full bg-[var(--color-brand-500)]/[0.12] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-300)]">Active</span>
        <span className="ml-auto text-caption text-text-muted">{ROWS.length} tickets</span>
      </div>
      <div className={treatment === "card" || treatment === "rail" ? "flex flex-col gap-1.5" : ""}>
        {ROWS.map((row, i) => (
          <RowBlock key={row.key} row={row} treatment={treatment} perLineToggle={perLineToggle} isLast={i === ROWS.length - 1} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- icon gallery -- */

type IconCmp = typeof Bell;
const ICON_OPTIONS: { id: string; label: string; open: IconCmp; closed: IconCmp; dimClosed?: boolean }[] = [
  { id: "bell", label: "Bell / BellOff", open: Bell, closed: BellOff },
  { id: "bellring", label: "BellRing / BellOff", open: BellRing, closed: BellOff },
  { id: "belldot", label: "BellDot / Bell", open: BellDot, closed: Bell, dimClosed: true },
  { id: "eye", label: "Eye / EyeOff", open: Eye, closed: EyeOff },
  { id: "megaphone", label: "Megaphone / off", open: Megaphone, closed: MegaphoneOff },
  { id: "message", label: "Message / off", open: MessageSquare, closed: MessageSquareOff },
  { id: "chevrons", label: "Collapse / expand", open: ChevronsDownUp, closed: ChevronsUpDown },
  { id: "activity", label: "Activity", open: Activity, closed: Activity, dimClosed: true },
  { id: "history", label: "History", open: HistoryIcon, closed: HistoryIcon, dimClosed: true },
  { id: "inbox", label: "Inbox", open: Inbox, closed: Inbox, dimClosed: true },
  { id: "info", label: "Info", open: Info, closed: Info, dimClosed: true },
];

/* ------------------------------------------------------------------- page -- */

export default function StatusChangeLinkingExploration() {
  const [treatment, setTreatment] = useState<Treatment>("connector");
  const [perLineToggle, setPerLineToggle] = useState(false);
  const [iconId, setIconId] = useState("bell");
  const [toggleOpen, setToggleOpen] = useState(true);

  const icon = ICON_OPTIONS.find((o) => o.id === iconId)!;
  const HeaderIcon = toggleOpen ? icon.open : icon.closed;
  const headerIconDim = !toggleOpen && icon.dimClosed;

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-10 py-8">
      <Link href="/dev/exploration" className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-muted transition-colors duration-150 hover:text-text-secondary">
        <ArrowLeft size={14} strokeWidth={1.5} />
        Exploration
      </Link>

      <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
        BRDG-414 · follow-up
      </p>
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">Linking the update line to its row</h1>
      <p className="mt-2 max-w-[820px] text-body-sm leading-[1.7] text-text-muted">
        The update line sits between two rows, so it is unclear whether it belongs to the ticket above or below it. It always
        describes the row <strong className="text-text-secondary">above</strong>. Below are five ways to make that binding obvious,
        plus a gallery of icons for the header notification toggle and an optional per-line mute control.
      </p>

      {/* Treatment selector */}
      <div className="mt-7 flex flex-wrap gap-1.5">
        {TREATMENTS.map((t) => {
          const active = treatment === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTreatment(t.id)}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-body-sm font-medium transition-colors duration-150 ${
                active ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]" : "border-border-default text-text-secondary hover:bg-overlay-subtle"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px self-center bg-overlay-strong" />
        <button
          type="button"
          onClick={() => setPerLineToggle((v) => !v)}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-body-sm font-medium transition-colors duration-150 ${
            perLineToggle ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]" : "border-border-default text-text-secondary hover:bg-overlay-subtle"
          }`}
        >
          <BellOff className="h-3.5 w-3.5" strokeWidth={1.75} />
          Per-line mute
        </button>
      </div>
      <p className="mt-3 max-w-[820px] text-body-sm leading-[1.6] text-text-tertiary">{TREATMENTS.find((t) => t.id === treatment)?.blurb}</p>

      <div className="mt-6 max-w-[920px]">
        <BoardSlice treatment={treatment} perLineToggle={perLineToggle} />
      </div>

      {/* Icon gallery */}
      <h2 className="mt-14 text-heading-sm font-semibold text-text-primary">Notification toggle icon</h2>
      <p className="mt-1 mb-4 max-w-[680px] text-body-sm leading-[1.6] text-text-muted">
        The subtle header toggle that opens/closes all update lines. Pick a candidate — it previews in the sprint-header mock below,
        in both the open (showing) and closed (hidden) state.
      </p>
      <div className="flex flex-wrap gap-2">
        {ICON_OPTIONS.map((o) => {
          const active = iconId === o.id;
          const OpenI = o.open;
          const ClosedI = o.closed;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setIconId(o.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors duration-150 ${
                active ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12]" : "border-border-default hover:bg-overlay-subtle"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <OpenI className={`h-4 w-4 ${active ? "text-[var(--color-brand-300)]" : "text-text-secondary"}`} strokeWidth={1.75} />
                <span className="text-text-muted">/</span>
                <ClosedI className={`h-4 w-4 text-text-muted ${o.dimClosed ? "opacity-40" : ""}`} strokeWidth={1.75} />
              </span>
              <span className={`text-caption ${active ? "text-[var(--color-brand-300)]" : "text-text-tertiary"}`}>{o.label}</span>
            </button>
          );
        })}
      </div>

      {/* Header mock with the chosen icon */}
      <div className="mt-5 max-w-[920px] overflow-hidden rounded-xl border border-border-default">
        <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)]/60 px-3 py-2">
          <span className="text-body-sm font-semibold text-text-primary">BT: 140</span>
          <span className="rounded-full bg-overlay-default px-1.5 py-0.5 text-caption tabular-nums text-text-tertiary">28</span>
          <span className="text-caption text-text-muted">TO DO: 10 · IN PROGRESS: 3 · TEST: 2 · DONE: 9</span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setToggleOpen((v) => !v)}
              title={toggleOpen ? "Hide status updates" : "Show status updates"}
              className={`grid h-6 w-6 cursor-pointer place-items-center rounded-md transition-colors duration-150 ${
                toggleOpen && !headerIconDim ? "text-[var(--color-brand-400)] hover:bg-overlay-default" : "text-text-muted hover:bg-overlay-default hover:text-text-secondary"
              } ${headerIconDim ? "opacity-50" : ""}`}
            >
              <HeaderIcon className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
            <span className="grid h-6 w-6 place-items-center rounded-md text-text-muted">+</span>
          </span>
        </div>
        {/* a couple of rows so the toggle has context */}
        {ROWS.slice(0, 2).map((row) => (
          <div key={row.key}>
            <div className="flex items-center gap-2.5 border-t border-border-subtle px-3 py-2">
              <StatusPill row={row} />
              <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{row.title}</span>
            </div>
            {toggleOpen && row.change && (
              <div className="flex items-center gap-2 px-3 py-1.5 pl-5">
                <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.75} />
                <UpdateContent change={row.change} assignee={DAVID} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
