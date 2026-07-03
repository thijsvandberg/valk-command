"use client";

import Link from "next/link";
import { Check, Rocket } from "lucide-react";
import type { JiraStatus } from "@/types/ticket";
import type { StatusChangeItem } from "@/lib/status-changes-query";
import type { LastDeployedInfo } from "@/hooks/usePipelines";
import { Tooltip } from "@/components/shared/Tooltip";
import { OpenSubtasksIndicator } from "@/components/sprint-board/OpenSubtasksIndicator";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { describeDeploy } from "@/lib/deploy-describe";
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

// Plain text — inherits the sentence's font/size/colour so the whole line reads uniform.
function StatusWord({ status }: { status: JiraStatus }) {
  return <>{STATUS_LABEL[status] ?? status}</>;
}

// Move-to-bottom and Generate-test-prompt share one quiet, neutral outline style.
const ACTION_BTN =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-caption font-medium text-text-secondary transition-colors duration-150";

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
  onGenerateTestDoc,
  testDocState,
}: {
  change: StatusChangeItem;
  deploy?: LastDeployedInfo;
  /** This ticket already sits in the trailing done/dep block, so "Move to bottom" is pointless. */
  atBottom?: boolean;
  onSeen: () => void;
  onMoveToBottom: () => void;
  onCloseSubtasks?: (key: string) => Promise<void>;
  /** Test/Done action: opens the stakeholder test-doc generate + validate flow (BRDG-426). */
  onGenerateTestDoc?: () => void;
  /** Drives the action label: no doc → Generate; draft/accepted → View (opens the
   *  same editable review flow). Explicitly marked not-needed shows no action. */
  testDocState?: "accepted" | "draft" | "not_needed" | null;
}) {
  const isFinished = change.toStatus === "DONE" || change.toStatus === "DEPRECATED";
  const isTest = change.toStatus === "TEST";
  // Testable or delivered work carries the test-doc affordance (BRDG-426);
  // deprecated work never needs delivery documentation.
  const showsTestDoc = (isTest || change.toStatus === "DONE") && testDocState !== "not_needed";
  // Show the last-deploy badge once work is testable or actively in progress.
  const showsDeploy = isTest || change.toStatus === "IN PROGRESS";
  const showSubtaskFlag = isFinished && change.openSubtaskCount > 0;

  // BRDG-439: a row can carry a status change, a sprint-add, or both. When a sprint-add is
  // present it leads the sentence and supplies the attribution (a drag-into-sprint is one
  // Jira action). The status affordances above are null-safe, so a sprint-only line shows
  // none of them.
  // BRDG-446: a third reason — a fresh UAT deploy. A deploy-only line (no status, no sprint-add)
  // leads with "New version on UAT" and has no actor; the status affordances stay suppressed
  // because isFinished/isTest are false when toStatus is null.
  const sprintAdd = change.sprintAdded;
  const deployAdded = change.deployAdded;
  const hasStatus = change.id != null && change.toStatus != null;
  const deployOnly = !hasStatus && !sprintAdd && !!deployAdded;
  const attribution = sprintAdd ? sprintAdd.changedBy : change.changedBy;
  const attributionAt = deployOnly && deployAdded ? deployAdded.completedAt : sprintAdd ? sprintAdd.changedAt : change.changedAt;

  // Single deploy-badge slot: the ambient last-deploy badge (case 1, unchanged) when the line
  // shows it, otherwise the fresh UAT deploy carried on the line itself (a deploy-only line, or
  // a status line whose ambient last-deploy is stale/absent). Exactly one can render, so the
  // status sentence never carries two badges.
  const badgeDeploy: LastDeployedInfo | null =
    showsDeploy && deploy?.environment
      ? deploy
      : deployAdded
        ? { environment: deployAdded.environment, completedAt: deployAdded.completedAt, state: deployAdded.state }
        : null;

  // storyVersion.createdAt is stored in SQLite UTC format ("YYYY-MM-DD HH:MM:SS", no zone);
  // normalise to a real UTC instant so the woven-in relative/absolute time isn't skewed by the
  // viewer's timezone. The comment timestamp is already a zoned Jira ISO, so it passes through.
  const storyEditedIso = change.storyEditedAt
    ? change.storyEditedAt.includes("T")
      ? change.storyEditedAt
      : `${change.storyEditedAt.replace(" ", "T")}Z`
    : null;

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
          {deployOnly ? (
            <>New version on UAT</>
          ) : sprintAdd && hasStatus ? (
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
          {/* Relative time woven into the sentence; hover shows the exact time. */}
          <Tooltip content={formatAbsoluteDate(attributionAt, { weekday: true })}>
            <span className="cursor-default">{relativeDate(attributionAt)}</span>
          </Tooltip>

          {/* What's new since reads as a natural clause continuing the sentence, in the SAME tone
              as the rest (no separate colour) so the whole line is one quiet sentence. Each part
              links out, with a fluent hover tooltip carrying the relative + exact time (BRDG-446). */}
          {(change.newCommentCount > 0 || storyEditedIso) && (
            <>
              {", with "}
              {change.newCommentCount > 0 && (
                <Tooltip
                  content={`${change.newCommentCount} new comment${change.newCommentCount === 1 ? "" : "s"}${
                    change.lastCommentAt
                      ? `, last ${relativeDate(change.lastCommentAt)} on ${formatAbsoluteDate(change.lastCommentAt, { weekday: true })}`
                      : ""
                  }. Click to open the comments.`}
                >
                  <Link href={buildTicketDetailUrl(change.ticketKey)} className="cursor-pointer underline-offset-2 hover:text-text-secondary hover:underline">
                    {change.newCommentCount} new comment{change.newCommentCount === 1 ? "" : "s"}
                  </Link>
                </Tooltip>
              )}
              {change.newCommentCount > 0 && storyEditedIso && " and "}
              {storyEditedIso && (
                <Tooltip content={`The story was edited ${relativeDate(storyEditedIso)}, on ${formatAbsoluteDate(storyEditedIso, { weekday: true })}. Click to open the history.`}>
                  <Link href={buildTicketDetailUrl(change.ticketKey, { tab: "history" })} className="cursor-pointer underline-offset-2 hover:text-text-secondary hover:underline">
                    a story edit
                  </Link>
                </Tooltip>
              )}
            </>
          )}
        </span>

        {/* Badges carry their own pill background, so no dot separator before them. */}
        {badgeDeploy && <DeploySignal deploy={badgeDeploy} />}

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
          {showsTestDoc && onGenerateTestDoc && (
            <Tooltip
              content={
                testDocState === "accepted" || testDocState === "draft"
                  ? "View and edit the test documentation next to the story"
                  : "Generate stakeholder test documentation from the story and comments, then validate it next to the story"
              }
            >
              <button
                type="button"
                onClick={onGenerateTestDoc}
                className={`${ACTION_BTN} cursor-pointer hover:bg-overlay-default hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
              >
                {testDocState === "accepted" || testDocState === "draft" ? "View test doc" : "Generate test doc"}
              </button>
            </Tooltip>
          )}
          <DismissButton onClick={onSeen} />
        </span>
      </div>
    </div>
  );
}
