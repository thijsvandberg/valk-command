"use client";

import Link from "next/link";
import { ArrowDownToLine, Check, Clock, GitBranch, ListChecks, MessageSquare, Rocket, Sparkles } from "lucide-react";
import type { JiraStatus } from "@/types/ticket";
import type { StatusChangeItem } from "@/lib/status-changes-query";
import type { LastDeployedInfo, PipelineHealthEntry } from "@/hooks/usePipelines";
import { Avatar } from "@/components/shared/Avatar";
import { Tooltip } from "@/components/shared/Tooltip";
import { buildAssignee } from "@/lib/user-utils";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { buildTicketDetailUrl } from "@/lib/ticket-detail-url";

// BRDG-414: the chosen "quiet line" beneath a changed board row. A grey info marker sits in
// the checkbox gutter; the sentence + signals are plain text; the contextual action (Move to
// bottom for Done/Deprecated, an inert Generate-test-prompt for Test) plus a dismiss checkmark
// sit on the right. Ported from the variant-1 prototype at /dev/exploration/status-changes.

const STATUS_LABEL: Record<JiraStatus, string> = {
  "TO DO": "To Do",
  "IN PROGRESS": "In Progress",
  TEST: "Test",
  DONE: "Done",
  DEPRECATED: "Deprecated",
};

const Sep = () => <span className="text-text-muted">&middot;</span>;

// Plain text (no per-status colour) — the words are the signal, not their colour.
function StatusWord({ status }: { status: JiraStatus }) {
  return <span className="font-medium text-text-secondary">{STATUS_LABEL[status] ?? status}</span>;
}

// Show the changer only when it differs from the assignee. Prefer the stable accountId.
function changerDiffersFromAssignee(change: StatusChangeItem): boolean {
  if (!change.changedBy) return false;
  if (!change.assignee) return true;
  if (change.changedByAccountId && change.assignee.accountId) {
    return change.changedByAccountId !== change.assignee.accountId;
  }
  return change.changedBy !== change.assignee.name;
}

const SIGNAL = "inline-flex items-center gap-1 text-caption font-medium";
// Move-to-bottom and Generate-test-prompt share one quiet, neutral outline style.
const ACTION_BTN =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-caption font-medium text-text-secondary transition-colors duration-150";

function DeploySignal({ deploy }: { deploy: LastDeployedInfo }) {
  if (!deploy.environment) return null;
  const tone =
    deploy.state === "SUCCESSFUL" ? "text-emerald-500"
    : deploy.state === "FAILED" ? "text-red-500"
    : "text-amber-500";
  return (
    <Tooltip content={`Last deploy: ${deploy.environment} — ${deploy.state}${deploy.completedAt ? ` (${formatAbsoluteDate(deploy.completedAt)})` : ""}`}>
      <span className={`${SIGNAL} ${tone}`}>
        <Rocket className="h-3 w-3 shrink-0" strokeWidth={2} />
        {deploy.environment}
        {deploy.state === "FAILED" ? " failed" : ""}
      </span>
    </Tooltip>
  );
}

function PipelineSignal({ health }: { health: PipelineHealthEntry }) {
  if (health.status === "gray" || health.recentTotal === 0) return null;
  const failed = health.recentFails > 0;
  return (
    <Tooltip content={`Pipeline: ${health.recentFails} failure${health.recentFails === 1 ? "" : "s"} in the last ${health.recentTotal} runs`}>
      <span className={`${SIGNAL} ${failed ? "text-red-500" : "text-emerald-500"}`}>
        <GitBranch className="h-3 w-3 shrink-0" strokeWidth={2} />
        {failed ? `${health.recentFails}/${health.recentTotal} failed` : `${health.recentTotal} green`}
      </span>
    </Tooltip>
  );
}

// Icon-only "mark seen / dismiss" checkmark.
function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip content="Mark as seen — removes it from the review queue">
      <button
        type="button"
        onClick={onClick}
        aria-label="Mark as seen"
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-text-muted transition-colors duration-150 hover:bg-overlay-default hover:text-text-secondary"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </Tooltip>
  );
}

export function StatusChangeLine({
  change,
  deploy,
  health,
  atBottom = false,
  onSeen,
  onMoveToBottom,
}: {
  change: StatusChangeItem;
  deploy?: LastDeployedInfo;
  health?: PipelineHealthEntry;
  /** This ticket already sits in the trailing done/dep block, so "Move to bottom" is pointless. */
  atBottom?: boolean;
  onSeen: () => void;
  onMoveToBottom: () => void;
}) {
  const isFinished = change.toStatus === "DONE" || change.toStatus === "DEPRECATED";
  const isTest = change.toStatus === "TEST";
  const showChanger = changerDiffersFromAssignee(change);
  const hasNew = change.newCommentCount > 0 || !!change.storyEditedAt;
  const showSubtaskFlag = isFinished && change.openSubtaskCount > 0;

  return (
    // Isolated from the row's click/drag so acting on the line never selects or drags the row.
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="flex items-center gap-2 bg-[var(--color-surface-base)]/40 py-1.5 pl-[45px] pr-[23px]"
    >
      {/* Single elbow connector whose vertical lines up with the row's issue-type icon (~48px
          from the row's left edge), so the line clearly branches DOWN from the row above. */}
      <span className="mb-2 h-3 w-3.5 shrink-0 rounded-bl-[6px] border-b border-l border-border-strong" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-caption text-text-tertiary">
          Updated from <StatusWord status={change.fromStatus as JiraStatus} /> to <StatusWord status={change.toStatus} />
          {showChanger && (
            <>
              {" by "}
              <span className="inline-flex items-center gap-1 align-middle">
                <Avatar assignee={buildAssignee(change.changedBy, change.changedByAccountId)} size={14} />
                <span className="font-medium text-text-secondary">{change.changedBy}</span>
              </span>
            </>
          )}
        </span>

        <Sep />
        <Tooltip content={`Jira event time: ${formatAbsoluteDate(change.changedAt)} (not the local sync time)`}>
          <span className="inline-flex cursor-default items-center gap-1 text-caption text-text-muted">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={1.75} />
            {relativeDate(change.changedAt)}
          </span>
        </Tooltip>

        {hasNew && (
          <>
            <Sep />
            {change.newCommentCount > 0 && (
              <Tooltip content={`${change.newCommentCount} new comment${change.newCommentCount === 1 ? "" : "s"}${change.lastCommentAt ? ` · last ${relativeDate(change.lastCommentAt)}` : ""} — open comments`}>
                <Link href={buildTicketDetailUrl(change.ticketKey)} className={`${SIGNAL} text-[var(--color-brand-300)] hover:underline`}>
                  <MessageSquare className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                  {change.newCommentCount}
                </Link>
              </Tooltip>
            )}
            {change.storyEditedAt && (
              <Tooltip content={`Story edited · ${formatAbsoluteDate(change.storyEditedAt)} — open history`}>
                <Link href={buildTicketDetailUrl(change.ticketKey, { tab: "history" })} className={`${SIGNAL} text-text-tertiary hover:underline`}>
                  <Sparkles className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  Story edited
                </Link>
              </Tooltip>
            )}
          </>
        )}

        {isTest && (deploy?.environment || (health && health.status !== "gray" && health.recentTotal > 0)) && (
          <>
            <Sep />
            {deploy && <DeploySignal deploy={deploy} />}
            {health && <PipelineSignal health={health} />}
          </>
        )}

        {showSubtaskFlag && (
          <>
            <Sep />
            <Tooltip content={`${change.openSubtaskCount} subtask${change.openSubtaskCount === 1 ? "" : "s"} still open — may not be done yet`}>
              <span className={`${SIGNAL} text-amber-500`}>
                <ListChecks className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                {change.openSubtaskCount} open
              </span>
            </Tooltip>
          </>
        )}

        <span className="ml-auto flex items-center gap-1.5">
          {isFinished && !atBottom && (
            <Tooltip content="Move to bottom — files it just below the Finished work divider. Nothing auto-moves; this is your confirmation it's done.">
              <button type="button" onClick={onMoveToBottom} className={`${ACTION_BTN} cursor-pointer hover:bg-overlay-default hover:text-text-primary`}>
                <ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.75} />
                Move to bottom
              </button>
            </Tooltip>
          )}
          {isTest && (
            <Tooltip content="Generate a test prompt from the story, comments and changes (coming soon)">
              <button type="button" disabled className={`${ACTION_BTN} cursor-not-allowed opacity-60`}>
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                Generate test prompt
              </button>
            </Tooltip>
          )}
          <DismissButton onClick={onSeen} />
        </span>
      </div>
    </div>
  );
}
