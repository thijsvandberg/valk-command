"use client";

import Link from "next/link";
import { Check, MessageSquare, Rocket, Sparkles } from "lucide-react";
import type { JiraStatus } from "@/types/ticket";
import type { StatusChangeItem } from "@/lib/status-changes-query";
import type { LastDeployedInfo } from "@/hooks/usePipelines";
import { Tooltip } from "@/components/shared/Tooltip";
import { OpenSubtasksIndicator } from "@/components/sprint-board/OpenSubtasksIndicator";
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

// Plain text — inherits the sentence's font/size/colour so the whole line reads uniform.
function StatusWord({ status }: { status: JiraStatus }) {
  return <>{STATUS_LABEL[status] ?? status}</>;
}

const SIGNAL = "inline-flex items-center gap-1 text-caption font-medium";
// Move-to-bottom and Generate-test-prompt share one quiet, neutral outline style.
const ACTION_BTN =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-caption font-medium text-text-secondary transition-colors duration-150";

// A plain-language, one-sentence summary of the most recent deploy for the tooltip.
export function describeDeploy(deploy: LastDeployedInfo): string {
  const env = deploy.environment;
  // Absolute date with the relative "xx ago" appended in parentheses for quick orientation.
  const stamp = deploy.completedAt
    ? `${formatAbsoluteDate(deploy.completedAt, { weekday: true })} (${relativeDate(deploy.completedAt)})`
    : null;
  if (deploy.state === "SUCCESSFUL") {
    return `Last deployed to ${env} successfully${stamp ? ` on ${stamp}` : ""}.`;
  }
  if (deploy.state === "FAILED") {
    return `The last deploy to ${env} failed${stamp ? ` on ${stamp}` : ""}.`;
  }
  const status = deploy.state.toLowerCase().replace(/_/g, " ").replace("inprogress", "in progress");
  return `Deploy to ${env} is ${status}${stamp ? `, as of ${stamp}` : ""}.`;
}

function DeploySignal({ deploy }: { deploy: LastDeployedInfo }) {
  if (!deploy.environment) return null;
  // A tinted badge (pill) matching the row's other meta badges.
  const tone =
    deploy.state === "SUCCESSFUL" ? "bg-emerald-500/10 text-emerald-500"
    : deploy.state === "FAILED" ? "bg-red-500/10 text-red-500"
    : "bg-amber-500/10 text-amber-500";
  return (
    <Tooltip content={describeDeploy(deploy)}>
      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption font-medium ${tone}`}>
        <Rocket className="h-3 w-3 shrink-0" strokeWidth={2} />
        {deploy.environment}
        {deploy.state === "FAILED" ? " failed" : ""}
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
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-text-muted transition-colors duration-150 hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </Tooltip>
  );
}

export function StatusChangeLine({
  change,
  deploy,
  atBottom = false,
  onSeen,
  onMoveToBottom,
  onCloseSubtasks,
}: {
  change: StatusChangeItem;
  deploy?: LastDeployedInfo;
  /** This ticket already sits in the trailing done/dep block, so "Move to bottom" is pointless. */
  atBottom?: boolean;
  onSeen: () => void;
  onMoveToBottom: () => void;
  onCloseSubtasks?: (key: string) => Promise<void>;
}) {
  const isFinished = change.toStatus === "DONE" || change.toStatus === "DEPRECATED";
  const isTest = change.toStatus === "TEST";
  // Show the last-deploy badge once work is testable or actively in progress.
  const showsDeploy = isTest || change.toStatus === "IN PROGRESS";
  const hasNew = change.newCommentCount > 0 || !!change.storyEditedAt;
  const showSubtaskFlag = isFinished && change.openSubtaskCount > 0;

  // BRDG-439: a row can carry a status change, a sprint-add, or both. When a sprint-add is
  // present it leads the sentence and supplies the attribution (a drag-into-sprint is one
  // Jira action). The status affordances above are null-safe, so a sprint-only line shows
  // none of them.
  const sprintAdd = change.sprintAdded;
  const hasStatus = change.id != null && change.toStatus != null;
  const attribution = sprintAdd ? sprintAdd.changedBy : change.changedBy;
  const attributionAt = sprintAdd ? sprintAdd.changedAt : change.changedAt;

  return (
    // Isolated from the row's click/drag so acting on the line never selects or drags the row.
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="relative -mt-1.5 flex items-center pb-1 pt-0 pl-[73px] pr-[23px]"
    >
      {/* Single elbow connector: its vertical sits at the CENTRE of the row's issue-type icon and
          its horizontal meets the vertical middle of the status-line text. left-[53px] = icon
          centre minus the surface's 3px accent border. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[53px] bottom-[calc(50%+2px)] h-3 w-3.5 rounded-bl-[6px] border-b border-l border-border-strong"
      />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="text-caption text-text-tertiary">
          {sprintAdd && hasStatus ? (
            <>
              Added to sprint and moved from <StatusWord status={change.fromStatus as JiraStatus} /> to{" "}
              <StatusWord status={change.toStatus as JiraStatus} />
            </>
          ) : sprintAdd ? (
            <>Added to sprint</>
          ) : (
            <>
              Updated from <StatusWord status={change.fromStatus as JiraStatus} /> to{" "}
              <StatusWord status={change.toStatus as JiraStatus} />
            </>
          )}
          {attribution && (
            <>
              {" by "}
              {attribution}
            </>
          )}
          {" "}
          {/* Relative time woven into the sentence (uniform with the rest); hover shows the exact time. */}
          <Tooltip content={formatAbsoluteDate(attributionAt, { weekday: true })}>
            <span className="cursor-default">{relativeDate(attributionAt)}</span>
          </Tooltip>
        </span>

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

        {/* Badges carry their own pill background, so no dot separator before them. */}
        {showsDeploy && deploy?.environment && <DeploySignal deploy={deploy} />}

        {showSubtaskFlag && (
          // Reuse the board's existing open-subtasks indicator: the amber badge opens the
          // "N of M subtasks open" popup with the list + "Close all subtasks" (BRDG-414).
          <OpenSubtasksIndicator
            ticketKey={change.ticketKey}
            // showSubtaskFlag implies isFinished, so toStatus is a non-null DONE/DEPRECATED here.
            jiraStatus={change.toStatus as JiraStatus}
            openCount={change.openSubtaskCount}
            totalCount={change.totalSubtaskCount}
            onCloseSubtasks={onCloseSubtasks}
            descriptive
          />
        )}

        <span className="flex items-center gap-1.5">
          {isFinished && !atBottom && (
            <Tooltip content="Move to bottom — files it just below the Finished work divider. Nothing auto-moves; this is your confirmation it's done.">
              <button type="button" onClick={onMoveToBottom} className={`${ACTION_BTN} cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}>
                Move to bottom
              </button>
            </Tooltip>
          )}
          {isTest && (
            <Tooltip content="Generate a test prompt from the story, comments and changes (coming soon)">
              <button type="button" className={`${ACTION_BTN} cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}>
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
