"use client";

/**
 * Throwaway exploration for BRDG-414: surfacing status changes of the active sprint
 * on the Sprint Board.
 *
 * For a ticket on your team's active sprint that changed Jira status, show: the from -> to
 * transition, WHEN (Jira's own event time, not the local sync time), and WHO — but only when
 * the changer differs from the assignee (the assignee avatar is already on the row). Alongside
 * we hint at OTHER new activity (new comments, story edited) as clickable links whose hover
 * reveals when it happened; for Test rows we add the deploy/UAT + pipeline-health signals the
 * project already tracks (LastDeployedInfo.environment, PipelineHealthEntry.recentFails).
 *
 * Action per new status:
 *   - DONE / DEPRECATED -> "Move to bottom" (files it just below the permanent Finished work
 *     divider via the real trailingDoneDepStart() rule) AND marks it seen in one go — the move
 *     is the PO's confirmation it's done. Nothing auto-moves.
 *   - TEST -> "Generate test prompt" (a stub; the agent skill is a follow-up).
 * Lifecycle is a review-QUEUE: an entry stays until acted on or marked seen.
 *
 * This page trials THREE inline presentations (it's no longer an expand/collapse) over one
 * faithful, board-like slice, to find the least-busy way to show it. Nothing is wired to real
 * data; actions land in the on-page log. Reachable at /dev/exploration/status-changes.
 */

import { Fragment, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  FlaskConical,
  GitBranch,
  GripVertical,
  ListChecks,
  MessageSquare,
  Rocket,
  Rows3,
  RotateCcw,
  Sparkles,
  SquarePen,
} from "lucide-react";
import type { Assignee, IssueType, JiraStatus, TicketReadiness } from "@/types/ticket";
import { JIRA_STATUS_ABBREVIATIONS, JIRA_STATUS_COLORS, READINESS_CONFIG } from "@/types/ticket";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { Avatar } from "@/components/shared/Avatar";
import { Tooltip } from "@/components/shared/Tooltip";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { trailingDoneDepStart } from "@/lib/sprint-insert-position";

/* -------------------------------------------------------------------- data -- */

const ALICE: Assignee = { name: "Alice de Vries", initials: "AV", color: "#5b8def" };
const BOB: Assignee = { name: "Bob Janssen", initials: "BJ", color: "#d9774b" };
const CAROL: Assignee = { name: "Carol Smit", initials: "CS", color: "#8a63d2" };
const DAN: Assignee = { name: "Dan Mol", initials: "DM", color: "#3aa67b" };

type DeployState = "SUCCESSFUL" | "FAILED" | "IN_PROGRESS";

type Change = {
  key: string;
  type: IssueType;
  from: JiraStatus;
  to: JiraStatus;
  /** Who made the status change. */
  by: Assignee;
  /** Jira's own event timestamp, formatted. NOT the local sync time. */
  jiraTime: string;
  relative: string;
  /** "What's new" hints since you last looked — just that something changed, plus when. */
  newComments?: number;
  commentAt?: string;
  storyEditedAt?: string;
  /** TEST only: latest deploy (LastDeployedInfo) + pipeline health (PipelineHealthEntry). */
  deploy?: { env: string; state: DeployState; at: string };
  pipeline?: { fails: number; total: number };
  /** DONE / DEPRECATED only: open subtasks remaining — a flag before confirming it's done. */
  openSubtasks?: number;
};

// `by` is deliberately a mix: same-as-assignee (hidden) for most, different for VPL-45410 and
// VPL-46265 (shown), to exercise the "only show the changer when it differs" rule.
const INITIAL_CHANGES: Change[] = [
  {
    key: "VPL-46742", type: "story", from: "IN PROGRESS", to: "TEST", by: ALICE,
    jiraTime: "26 Jun 2026, 14:08", relative: "2h ago",
    newComments: 2, commentAt: "26 Jun 2026, 14:02", storyEditedAt: "26 Jun 2026, 11:20",
    deploy: { env: "UAT2", state: "SUCCESSFUL", at: "26 Jun 2026, 13:50" }, pipeline: { fails: 0, total: 8 },
  },
  {
    key: "VPL-46801", type: "story", from: "IN PROGRESS", to: "TEST", by: BOB,
    jiraTime: "26 Jun 2026, 15:05", relative: "1h ago",
    deploy: { env: "UAT1", state: "FAILED", at: "26 Jun 2026, 14:55" }, pipeline: { fails: 3, total: 9 },
  },
  {
    key: "VPL-46664", type: "task", from: "TEST", to: "DONE", by: BOB,
    jiraTime: "26 Jun 2026, 09:14", relative: "today 09:14",
    newComments: 1, commentAt: "26 Jun 2026, 08:50", openSubtasks: 2,
  },
  {
    key: "VPL-46265", type: "task", from: "IN PROGRESS", to: "DEPRECATED", by: ALICE,
    jiraTime: "25 Jun 2026, 17:42", relative: "yesterday",
    storyEditedAt: "25 Jun 2026, 16:30",
  },
  {
    key: "VPL-45410", type: "bug", from: "TO DO", to: "IN PROGRESS", by: CAROL,
    jiraTime: "26 Jun 2026, 11:30", relative: "4h ago",
    newComments: 3, commentAt: "26 Jun 2026, 12:10",
  },
];

type Row = {
  key: string;
  title: string;
  type: IssueType;
  status: JiraStatus;
  epic: string;
  sp: number;
  bv: number;
  by: Assignee;
  readiness?: TicketReadiness;
};

// Statuses reflect the post-change state. VPL-46664 (DONE) and VPL-46265 (DEPRECATED) sit
// mid-list — done in Jira but not yet filed by the PO; "Move to bottom" relocates them just
// below the permanent Finished work divider.
const INITIAL_ROWS: Row[] = [
  { key: "VPL-45410", title: "Correct DataLayer roomType + siteLanguage", type: "bug", status: "IN PROGRESS", epic: "Data Layer", sp: 5, bv: 3, by: DAN },
  { key: "VPL-46742", title: "Move action clicks to parent", type: "story", status: "TEST", epic: "Booking flow", sp: 3, bv: 5, by: ALICE },
  { key: "VPL-46801", title: "Refine availability cache TTL", type: "story", status: "TEST", epic: "Performance", sp: 8, bv: 2, by: BOB },
  { key: "VPL-46265", title: "Add Stryker to improve code quality", type: "task", status: "DEPRECATED", epic: "Code quality", sp: 2, bv: 1, by: CAROL },
  { key: "VPL-46900", title: "Surface promo eligibility on PDP", type: "story", status: "TO DO", epic: "Promotions", sp: 5, bv: 8, by: ALICE, readiness: "ready_to_refine" },
  { key: "VPL-46664", title: "Stabilize VR tests", type: "task", status: "DONE", epic: "Testing", sp: 5, bv: 1, by: BOB },
  { key: "VPL-46500", title: "Cache region resolver responses", type: "task", status: "TO DO", epic: "Performance", sp: 3, bv: 2, by: DAN, readiness: "drafting" },
  { key: "VPL-44990", title: "Tidy booking summary copy", type: "task", status: "DONE", epic: "Booking flow", sp: 2, bv: 1, by: CAROL },
  { key: "VPL-44012", title: "Drop legacy promo banner", type: "task", status: "DEPRECATED", epic: "Promotions", sp: 1, bv: 1, by: DAN },
];

const FINISHED = new Set<JiraStatus>(["DONE", "DEPRECATED"]);

type PrimaryAction = "move" | "test" | null;
function primaryActionFor(to: JiraStatus): PrimaryAction {
  if (to === "DONE" || to === "DEPRECATED") return "move";
  if (to === "TEST") return "test";
  return null;
}

/* -------------------------------------------------------------- primitives -- */

function StatusBadge({ status, dim, round }: { status: JiraStatus; dim?: boolean; round?: boolean }) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide ${
        round ? "rounded-full" : "rounded"
      } ${status === "DEPRECATED" ? "line-through" : ""}`}
      style={{ backgroundColor: c.bg, color: c.text, opacity: dim ? 0.7 : 1 }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full opacity-70" style={{ backgroundColor: c.text }} />
      {JIRA_STATUS_ABBREVIATIONS[status]}
    </span>
  );
}

function Transition({ from, to }: { from: JiraStatus; to: JiraStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusBadge status={from} />
      <ArrowRight className="h-3 w-3 shrink-0 text-text-muted" strokeWidth={2} />
      <StatusBadge status={to} />
    </span>
  );
}

const Sep = () => <span className="text-text-muted">&middot;</span>;

const STATUS_LABEL: Record<JiraStatus, string> = {
  "TO DO": "To Do",
  "IN PROGRESS": "In Progress",
  TEST: "Test",
  DONE: "Done",
  DEPRECATED: "Deprecated",
};

// A status word colored by its status, for the sentence-style line.
function StatusWord({ status }: { status: JiraStatus }) {
  return (
    <span className="font-semibold" style={{ color: JIRA_STATUS_COLORS[status].text }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// The relative time, with the exact Jira event time on hover.
function TimeChip({ change }: { change: Change }) {
  return (
    <Tooltip content={`Status change · Jira event time ${change.jiraTime} (not the local sync time)`}>
      <span className="inline-flex cursor-default items-center gap-1 text-text-muted">
        <Clock className="h-3 w-3" strokeWidth={1.75} />
        {change.relative}
      </span>
    </Tooltip>
  );
}

// Who + when. The person is shown only when the changer differs from the assignee; the time
// always shows, with the exact Jira event time on hover.
function ChangeWho({ change, assignee, avatarSize = 16 }: { change: Change; assignee: Assignee; avatarSize?: number }) {
  const differs = change.by.name !== assignee.name;
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-text-muted">
      {differs && (
        <>
          <Avatar assignee={change.by} size={avatarSize} />
          <span className="text-text-tertiary">{change.by.name}</span>
          <Sep />
        </>
      )}
      <TimeChip change={change} />
    </span>
  );
}

// Sentence-style summary for the chosen quiet line: "Updated from In Progress to Test by Frank".
// The "by <name>" only appears when the changer differs from the assignee.
function ChangeSentence({ change, assignee }: { change: Change; assignee: Assignee }) {
  const differs = change.by.name !== assignee.name;
  return (
    <span className="text-caption text-text-tertiary">
      Updated from <StatusWord status={change.from} /> to <StatusWord status={change.to} />
      {differs && (
        <>
          {" by "}
          <span className="inline-flex items-center gap-1 align-middle">
            <Avatar assignee={change.by} size={14} />
            <span className="font-medium text-text-secondary">{change.by.name}</span>
          </span>
        </>
      )}
    </span>
  );
}

type Tone = "brand" | "muted" | "ok" | "bad" | "warn";
const TONE_TEXT: Record<Tone, string> = {
  brand: "text-[var(--color-brand-300)]",
  muted: "text-text-tertiary",
  ok: "text-emerald-500",
  bad: "text-red-500",
  warn: "text-amber-500",
};
const TONE_CHIP: Record<Tone, string> = {
  brand: "bg-[var(--color-brand-500)]/[0.12]",
  muted: "bg-overlay-default",
  ok: "bg-emerald-500/10",
  bad: "bg-red-500/10",
  warn: "bg-amber-500/10",
};

function Signal({
  icon: Icon,
  label,
  tooltip,
  tone,
  chip,
  onClick,
}: {
  icon: typeof MessageSquare;
  label?: ReactNode;
  tooltip: ReactNode;
  tone: Tone;
  chip?: boolean;
  onClick?: () => void;
}) {
  const base = chip
    ? `inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${TONE_CHIP[tone]}`
    : "inline-flex items-center gap-1";
  const interactive = onClick ? "cursor-pointer hover:underline focus-visible:outline-none focus-visible:underline" : "";
  const cls = `${base} text-caption font-medium ${TONE_TEXT[tone]} ${interactive}`;
  const body = (
    <>
      <Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
      {label}
    </>
  );
  const el = onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
  return <Tooltip content={tooltip}>{el}</Tooltip>;
}

// The "what's new" + test signals, rendered as either chips (grouped variant) or bare links.
function CommentSignal({ change, chip, onOpen }: { change: Change; chip?: boolean; onOpen: () => void }) {
  if (!change.newComments) return null;
  return (
    <Signal
      icon={MessageSquare}
      label={change.newComments}
      tone="brand"
      chip={chip}
      onClick={onOpen}
      tooltip={`${change.newComments} new comment${change.newComments === 1 ? "" : "s"}${change.commentAt ? ` · last ${change.commentAt}` : ""} — open comments`}
    />
  );
}
function StorySignal({ change, chip, label, onOpen }: { change: Change; chip?: boolean; label?: boolean; onOpen: () => void }) {
  if (!change.storyEditedAt) return null;
  return (
    <Signal
      icon={SquarePen}
      label={label ? "Story" : undefined}
      tone="muted"
      chip={chip}
      onClick={onOpen}
      tooltip={`Story edited · ${change.storyEditedAt} — open history`}
    />
  );
}
function DeploySignal({ change, chip }: { change: Change; chip?: boolean }) {
  const d = change.deploy;
  if (!d) return null;
  const tone: Tone = d.state === "SUCCESSFUL" ? "ok" : d.state === "FAILED" ? "bad" : "muted";
  return (
    <Signal
      icon={Rocket}
      label={`${d.env}${d.state === "FAILED" ? " failed" : d.state === "IN_PROGRESS" ? "…" : ""}`}
      tone={tone}
      chip={chip}
      tooltip={`Last deploy: ${d.env} — ${d.state} (${d.at})`}
    />
  );
}
function PipelineSignal({ change, chip }: { change: Change; chip?: boolean }) {
  const p = change.pipeline;
  if (!p) return null;
  const tone: Tone = p.fails > 0 ? "bad" : "ok";
  return (
    <Signal
      icon={GitBranch}
      label={p.fails > 0 ? `${p.fails}/${p.total} failed` : `${p.total} green`}
      tone={tone}
      chip={chip}
      tooltip={`Pipeline: ${p.fails} failure${p.fails === 1 ? "" : "s"} in the last ${p.total} runs`}
    />
  );
}
// DONE / DEPRECATED only: warns that subtasks are still open before you confirm it's done.
function SubtaskSignal({ change, chip }: { change: Change; chip?: boolean }) {
  if (change.to !== "DONE" && change.to !== "DEPRECATED") return null;
  if (!change.openSubtasks) return null;
  return (
    <Signal
      icon={ListChecks}
      label={`${change.openSubtasks} open`}
      tone="warn"
      chip={chip}
      tooltip={`${change.openSubtasks} subtask${change.openSubtasks === 1 ? "" : "s"} still open — may not be done yet`}
    />
  );
}

/* ----------------------------------------------------------------- actions -- */

const ACTION_BTN =
  "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-caption font-medium transition-colors duration-150";

// Move-to-bottom files the ticket below the divider AND marks it seen in one gesture.
function MoveButton({ onMove, compact }: { onMove: () => void; compact?: boolean }) {
  return (
    <Tooltip content="Move to bottom — files it just below the Finished work divider and marks it seen (your confirmation it's done). Nothing auto-moves.">
      <button
        type="button"
        onClick={onMove}
        className={`${ACTION_BTN} border border-border-default text-text-secondary hover:bg-overlay-default hover:text-text-primary`}
      >
        <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.75} />
        {compact ? "Bottom" : "Move to bottom"}
      </button>
    </Tooltip>
  );
}
function TestButton({ onTest, compact }: { onTest: () => void; compact?: boolean }) {
  return (
    <Tooltip content="Generate a test prompt from the story, comments and changes (coming soon — BRDG-414 follow-up)">
      <button
        type="button"
        onClick={onTest}
        className={`${ACTION_BTN} border border-[var(--sp-test-text)]/30 bg-[var(--sp-test-bg)] text-[var(--sp-test-text)] hover:brightness-105`}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
        {compact ? "Test prompt" : "Generate test prompt"}
      </button>
    </Tooltip>
  );
}
function SeenButton({ onSeen, label }: { onSeen: () => void; label?: boolean }) {
  return (
    <Tooltip content="Mark as seen — removes it from the review queue">
      <button
        type="button"
        onClick={onSeen}
        className={`${ACTION_BTN} text-text-muted hover:bg-overlay-default hover:text-text-secondary`}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
        {label && "Seen"}
      </button>
    </Tooltip>
  );
}

// For DONE/DEPR the move already clears it, so no separate Seen. Test keeps a Seen alongside the
// (non-clearing) prompt stub; statuses with no action just get Seen.
function ChangeActions({
  change,
  onMove,
  onTest,
  onSeen,
  compact,
}: {
  change: Change;
  onMove: () => void;
  onTest: () => void;
  onSeen: () => void;
  compact?: boolean;
}) {
  const action = primaryActionFor(change.to);
  if (action === "move") return <MoveButton onMove={onMove} compact={compact} />;
  if (action === "test") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <TestButton onTest={onTest} compact={compact} />
        <SeenButton onSeen={onSeen} label={!compact} />
      </span>
    );
  }
  return <SeenButton onSeen={onSeen} label={!compact} />;
}

/* ---------------------------------------------------------------- board pill -- */

function ReadinessDot({ readiness }: { readiness: TicketReadiness }) {
  const cfg = READINESS_CONFIG[readiness];
  return (
    <Tooltip content={cfg.label}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cfg.color }} />
    </Tooltip>
  );
}

// Mirrors the real board's elevated status chip (type + key + status + readiness in one ringed,
// shadowed pill) so the slice reads like the actual board.
function RowStatusPill({ row }: { row: Row }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-surface-elevated px-1.5 py-[3px] ring-1 ring-inset ring-border-subtle shadow-[0_1px_2px_rgba(0,0,0,0.14)]">
      <IssueTypeIcon type={row.type} size={15} strokeWidth={2} />
      <span className="font-mono text-label font-medium leading-none text-text-primary">{row.key}</span>
      <StatusBadge status={row.status} round dim={FINISHED.has(row.status)} />
      {row.readiness && <ReadinessDot readiness={row.readiness} />}
    </span>
  );
}

/* -------------------------------------------------------------- board slice -- */

// A permanent board element (per PO): the boundary between active work and confirmed-done work.
// Nothing auto-moves below it — the PO moves a finished ticket down by hand, and that is the
// confirmation it's truly done.
function FinishedDivider() {
  return (
    <div className="flex items-center gap-2 bg-overlay-subtle/40 px-3 py-1">
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-muted">
        <CheckCheck className="h-3 w-3" strokeWidth={1.75} />
        finished work
      </span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

function BoardSlice({
  rows,
  highlightKey,
  changedKeys,
  rowMeta,
  detail,
}: {
  rows: Row[];
  highlightKey: string | null;
  changedKeys: Set<string>;
  /** Extra content injected into the row's right meta cluster (used by the on-row variant). */
  rowMeta?: (row: Row) => ReactNode;
  /** A strip rendered beneath the row (used by the line / grouped variants). */
  detail?: (row: Row) => ReactNode;
}) {
  const insertIdx = trailingDoneDepStart(rows.map((r) => ({ jiraStatus: r.status })));
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-floating)]/40">
      <div className="flex items-center gap-2 border-b border-border-strong bg-[var(--color-surface-elevated)]/60 px-3 py-2">
        <Rows3 className="h-3.5 w-3.5 text-[var(--color-brand-400)]" strokeWidth={1.75} />
        <span className="text-body-sm font-semibold text-text-primary">BT: 140</span>
        <span className="rounded-full bg-[var(--color-brand-500)]/[0.12] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-300)]">
          Active &middot; your team
        </span>
        <span className="ml-auto text-caption text-text-muted">{rows.length} tickets</span>
      </div>
      {rows.map((row, i) => {
        const finished = FINISHED.has(row.status);
        const isHighlight = row.key === highlightKey;
        const changed = changedKeys.has(row.key);
        const detailEl = detail?.(row);
        const metaEl = rowMeta?.(row);
        return (
          <Fragment key={row.key}>
            {i === insertIdx && <FinishedDivider />}
            <div
              className={`group flex items-center gap-2.5 border-b border-border-subtle px-3 py-2 transition-colors duration-300 ${
                isHighlight ? "bg-[var(--color-brand-500)]/[0.10] ring-1 ring-inset ring-[var(--color-brand-400)]/40" : ""
              } ${finished ? "opacity-60" : ""}`}
              style={changed && !isHighlight ? { boxShadow: "inset 2px 0 0 var(--color-brand-400)" } : undefined}
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded border border-border-strong opacity-0 transition-opacity group-hover:opacity-100" />
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
              <RowStatusPill row={row} />
              <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{row.title}</span>
              {metaEl}
              <EpicBadge epic={row.epic} className="hidden max-w-[120px] xl:inline-flex" />
              <MetricBadge metric="sp" value={row.sp} tinted />
              <MetricBadge metric="bv" value={row.bv} tinted />
              <Avatar assignee={row.by} size={20} />
            </div>
            {detailEl}
          </Fragment>
        );
      })}
      {insertIdx === rows.length && <FinishedDivider />}
    </div>
  );
}

/* -------------------------------------------------------------- variations -- */

type VariantId = "line" | "onrow" | "grouped";

const VARIANTS: { id: VariantId; label: string; blurb: string }[] = [
  {
    id: "line",
    label: "1 · Quiet line (chosen)",
    blurb:
      "Chosen direction. One calm line beneath each changed row, phrased as a sentence — “Updated from In Progress to Test by Frank” (the “by …” only when the changer differs from the assignee) — then Jira time and bare, linkable signals separated by dots, action on the right. Done/Deprecated also flags any open subtasks. No chip backgrounds; the lightest footprint.",
  },
  {
    id: "onrow",
    label: "2 · On the row",
    blurb:
      "No second line at all. The transition + icon-only signals + action sit in the row's right cluster; everything lives behind hover tooltips (who, when, deploy detail). The row stays a single line; a brand accent on the left marks a changed row.",
  },
  {
    id: "grouped",
    label: "3 · Grouped chips",
    blurb:
      "A sub-strip, but the noise is consolidated: 'what's new' merges into one activity chip and the deploy + pipeline merge into one test chip — fewer, larger boxes instead of a row of little ones.",
  },
];

/* ------------------------------------------------------------------- page -- */

export default function StatusChangesExploration() {
  const [variant, setVariant] = useState<VariantId>("line");
  const [changes, setChanges] = useState<Change[]>(INITIAL_CHANGES);
  const [rows, setRows] = useState<Row[]>(INITIAL_ROWS);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const byKey = useMemo(() => new Map(changes.map((c) => [c.key, c])), [changes]);
  const assigneeByKey = useMemo(() => new Map(rows.map((r) => [r.key, r.by])), [rows]);
  const changedKeys = useMemo(() => new Set(changes.map((c) => c.key)), [changes]);

  function pushLog(msg: string) {
    setLog((prev) => [msg, ...prev].slice(0, 7));
  }
  function dismiss(key: string) {
    setChanges((prev) => prev.filter((c) => c.key !== key));
  }
  function onSeen(key: string) {
    dismiss(key);
    pushLog(`${key}: marked seen — cleared from queue`);
  }
  function onSeenAll() {
    setChanges([]);
    pushLog("Marked all changes seen");
  }
  function onMove(key: string) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx === -1) return prev;
      const row = prev[idx];
      const without = prev.filter((r) => r.key !== key);
      const insertAt = trailingDoneDepStart(without.map((r) => ({ jiraStatus: r.status })));
      const next = [...without];
      next.splice(insertAt, 0, row);
      return next;
    });
    setHighlight(key);
    dismiss(key);
    pushLog(`${key}: moved to bottom + marked seen (confirmed done)`);
  }
  function onTest(key: string) {
    pushLog(`${key}: generate test prompt — STUB (agent skill is a BRDG-414 follow-up)`);
  }
  function onOpen(key: string, what: string) {
    pushLog(`${key}: open ${what} (would deep-link into the ticket)`);
  }
  function onReset() {
    setChanges(INITIAL_CHANGES);
    setRows(INITIAL_ROWS);
    setHighlight(null);
    pushLog("Demo reset");
  }

  const actionsFor = (c: Change, compact?: boolean) => (
    <ChangeActions
      change={c}
      onMove={() => onMove(c.key)}
      onTest={() => onTest(c.key)}
      onSeen={() => onSeen(c.key)}
      compact={compact}
    />
  );

  // Variant 1 (chosen) — quiet, sentence-style line beneath the row.
  const lineDetail = (row: Row): ReactNode => {
    const c = byKey.get(row.key);
    if (!c) return null;
    const hasNew = !!c.newComments || !!c.storyEditedAt;
    const finishedChange = c.to === "DONE" || c.to === "DEPRECATED";
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border-subtle bg-[var(--color-surface-base)] py-2 pl-12 pr-3">
        <ChangeSentence change={c} assignee={row.by} />
        <Sep />
        <TimeChip change={c} />
        {hasNew && (
          <>
            <Sep />
            <CommentSignal change={c} onOpen={() => onOpen(c.key, "comments")} />
            <StorySignal change={c} onOpen={() => onOpen(c.key, "history")} />
          </>
        )}
        {c.to === "TEST" && (
          <>
            <Sep />
            <DeploySignal change={c} />
            <PipelineSignal change={c} />
          </>
        )}
        {finishedChange && c.openSubtasks ? (
          <>
            <Sep />
            <SubtaskSignal change={c} />
          </>
        ) : null}
        <span className="ml-auto">{actionsFor(c)}</span>
      </div>
    );
  };

  // Variant 2 — everything on the row, icon-only, detail behind hover.
  const onrowMeta = (row: Row): ReactNode => {
    const c = byKey.get(row.key);
    if (!c) return null;
    const differs = c.by.name !== row.by.name;
    return (
      <span className="inline-flex shrink-0 items-center gap-2">
        <Tooltip
          content={`${c.from} -> ${c.to}${differs ? ` by ${c.by.name}` : ""} · ${c.jiraTime} (Jira time)`}
        >
          <span className="inline-flex items-center">
            <Transition from={c.from} to={c.to} />
          </span>
        </Tooltip>
        {differs && (
          <Tooltip content={`Changed by ${c.by.name}`}>
            <span className="inline-flex">
              <Avatar assignee={c.by} size={16} />
            </span>
          </Tooltip>
        )}
        <CommentSignal change={c} onOpen={() => onOpen(c.key, "comments")} />
        <StorySignal change={c} onOpen={() => onOpen(c.key, "history")} />
        <DeploySignal change={c} />
        <PipelineSignal change={c} />
        <SubtaskSignal change={c} />
        <span className="pl-1">{actionsFor(c, true)}</span>
      </span>
    );
  };

  // Variant 3 — grouped chips: one activity chip + one test chip.
  const groupedDetail = (row: Row): ReactNode => {
    const c = byKey.get(row.key);
    if (!c) return null;
    const hasActivity = !!c.newComments || !!c.storyEditedAt;
    const showSubtasks = (c.to === "DONE" || c.to === "DEPRECATED") && !!c.openSubtasks;
    return (
      <div className="border-b border-border-subtle bg-[var(--color-surface-base)] py-2.5 pl-12 pr-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Transition from={c.from} to={c.to} />
            <ChangeWho change={c} assignee={row.by} />
          </div>
          {actionsFor(c)}
        </div>
        {(hasActivity || c.to === "TEST" || showSubtasks) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {hasActivity && (
              <span className="inline-flex items-center gap-2 rounded-md bg-overlay-default px-2 py-1">
                <CommentSignal change={c} onOpen={() => onOpen(c.key, "comments")} />
                <StorySignal change={c} label onOpen={() => onOpen(c.key, "history")} />
              </span>
            )}
            {c.to === "TEST" && (
              <span className="inline-flex items-center gap-2 rounded-md bg-overlay-default px-2 py-1">
                <DeploySignal change={c} />
                <PipelineSignal change={c} />
              </span>
            )}
            {showSubtasks && <SubtaskSignal change={c} chip />}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-10 py-8">
      <Link
        href="/dev/exploration"
        className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-muted transition-colors duration-150 hover:text-text-secondary"
      >
        <ArrowLeft size={14} strokeWidth={1.5} />
        Exploration
      </Link>

      <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
        BRDG-414
      </p>
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
        Status changes on the active sprint
      </h1>
      <p className="mt-2 max-w-[880px] text-body-sm leading-[1.7] text-text-muted">
        For a ticket on your team&rsquo;s active sprint that changed Jira status, surface the{" "}
        <strong className="text-text-secondary">from &rarr; to</strong> transition, the{" "}
        <strong className="text-text-secondary">Jira event time</strong> (not the local sync time) and{" "}
        <strong className="text-text-secondary">who</strong> — but only when the changer differs from the assignee.
        Plus a hint of what else is new (<strong className="text-text-secondary">comments</strong>,{" "}
        <strong className="text-text-secondary">story edits</strong>, as links whose hover shows when) and, for{" "}
        <em>Test</em> rows, <strong className="text-text-secondary">UAT deploy</strong> +{" "}
        <strong className="text-text-secondary">pipeline failures</strong>. Action per new status:{" "}
        <em>Done/Deprecated</em> &rarr; <strong className="text-text-secondary">Move to bottom</strong> (files it below the
        permanent Finished work divider <em>and</em> marks it seen — nothing auto-moves; also flags any{" "}
        <strong className="text-text-secondary">open subtasks</strong>), <em>Test</em> &rarr; generate test prompt (stub).
        Chosen direction is variant 1 (quiet line); 2 and 3 are kept for comparison.
      </p>

      {/* Variant tabs */}
      <div className="mt-7 flex flex-wrap items-center gap-1.5">
        {VARIANTS.map((v) => {
          const active = variant === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariant(v.id)}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-body-sm font-medium transition-colors duration-150 ${
                active
                  ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.12] text-[var(--color-brand-300)]"
                  : "border-border-default text-text-secondary hover:bg-overlay-subtle"
              }`}
            >
              {v.label}
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px bg-overlay-strong" />
        {changes.length > 0 ? (
          <button
            type="button"
            onClick={onSeenAll}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-medium text-text-muted hover:bg-overlay-default hover:text-text-secondary"
          >
            <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            Mark all seen
          </button>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1.5 text-caption font-medium text-text-secondary hover:bg-overlay-default hover:text-text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
            Reset demo
          </button>
        )}
      </div>
      <p className="mt-3 max-w-[880px] text-body-sm leading-[1.6] text-text-tertiary">
        {VARIANTS.find((v) => v.id === variant)?.blurb}
      </p>

      {/* Stage */}
      <div className="mt-6 max-w-[1040px]">
        {variant === "line" && (
          <BoardSlice rows={rows} highlightKey={highlight} changedKeys={changedKeys} detail={lineDetail} />
        )}
        {variant === "onrow" && (
          <BoardSlice rows={rows} highlightKey={highlight} changedKeys={changedKeys} rowMeta={onrowMeta} />
        )}
        {variant === "grouped" && (
          <BoardSlice rows={rows} highlightKey={highlight} changedKeys={changedKeys} detail={groupedDetail} />
        )}
      </div>

      {/* Action mapping reference */}
      <h2 className="mt-12 text-heading-sm font-semibold text-text-primary">Action per new status</h2>
      <p className="mt-1 mb-4 max-w-[680px] text-body-sm leading-[1.6] text-text-muted">
        Same in every variant — only the presentation differs.
      </p>
      <div className="max-w-[740px] overflow-hidden rounded-xl border border-border-default">
        {(
          [
            { to: "TEST" as JiraStatus, action: "Generate test prompt + Seen", note: "Stub now (follow-up). Card also shows UAT deploy + pipeline failures." },
            { to: "DONE" as JiraStatus, action: "Move to bottom", note: "Files it below the divider AND marks it seen. Flags open subtasks. Nothing auto-moves." },
            { to: "DEPRECATED" as JiraStatus, action: "Move to bottom", note: "Same as Done (incl. open-subtask flag)." },
            { to: "IN PROGRESS" as JiraStatus, action: "Seen", note: "No special action; mark seen to clear." },
            { to: "TO DO" as JiraStatus, action: "Seen", note: "No special action; mark seen to clear." },
          ]
        ).map((r) => (
          <div key={r.to} className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-0">
            <StatusBadge status={r.to} />
            <span className="w-[190px] shrink-0 text-body-sm font-medium text-text-secondary">{r.action}</span>
            <span className="text-caption text-text-muted">{r.note}</span>
          </div>
        ))}
      </div>

      {/* Action log */}
      <h2 className="mt-12 text-heading-sm font-semibold text-text-primary">Action log</h2>
      <p className="mt-1 mb-3 text-body-sm text-text-muted">What a real surface would dispatch.</p>
      <div className="max-w-[680px] rounded-xl border border-border-default bg-[var(--color-surface-base)] p-3 font-mono text-body-sm">
        {log.length === 0 ? (
          <span className="text-text-muted">No actions yet — try the buttons above.</span>
        ) : (
          log.map((l, i) => (
            <div key={i} className={i === 0 ? "text-[var(--color-brand-300)]" : "text-text-tertiary"}>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
