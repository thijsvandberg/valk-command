"use client";

import { useEffect, useMemo } from "react";
import {
  CloudUpload,
  CloudDownload,
  Save,
  Check,
  Trash2,
  Loader2,
  Star,
  Scissors,
  Flag,
  MoreHorizontal,
  ArrowUpRight,
  NotebookPen,
  SendHorizontal,
  LogOut,
  Gem,
} from "lucide-react";
import Link from "next/link";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { useDraftSync } from "@/hooks/useDraftSync";
import { useTicketDetail, useTicketReviews, useJiraSprints } from "@/hooks/useSprintBoard";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { SplitStoryPicker } from "./SplitStoryPicker";
import dynamic from "next/dynamic";
const AddToRefinementModal = dynamic(
  () => import("@/components/refinement-session/AddToRefinementModal").then((m) => ({ default: m.AddToRefinementModal })),
  { ssr: false },
);
import { getJiraUrl } from "@/lib/jira-url";
import { ViewHeader, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { buildTicketHoverData } from "@/hooks/useTicketHoverData";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PaneProvider, usePaneContext } from "./panes/PaneContext";
import { WriterProvider, useWriterContext } from "./panes/WriterContext";
import { ApplicationListBar } from "./panes/ApplicationListBar";
import { AppToolbar } from "./panes/AppToolbar";
import { PaneArea } from "./panes/PaneArea";
import { useStoryWriterActions } from "./useStoryWriterActions";
import type { JiraStatus } from "@/types/ticket";

// Syncs splitModeVisible + targetTicketKey -> opens/closes the split-target pane app
function SplitModeSync() {
  const writer = useWriterContext();
  const pane = usePaneContext();
  const shouldOpen = writer.splitModeVisible && !!writer.targetTicketKey;

  useEffect(() => {
    if (shouldOpen) {
      pane.openApp("split-target");
    } else {
      pane.closeApp("split-target");
    }
  }, [shouldOpen, pane]);

  return null;
}

interface StoryWriterLayoutProps {
  ticketKey: string;
  draftTitle?: string;
  draftType?: string;
}

export function StoryWriterLayout({ ticketKey, draftTitle, draftType }: StoryWriterLayoutProps) {
  const draftSync = useDraftSync(ticketKey);
  const isDraft = ticketKey.startsWith("DRAFT-");
  const effectiveKey = draftSync.realKey ?? ticketKey;
  const isStillDraft = isDraft && !draftSync.realKey;
  const writer = useStoryWriter(ticketKey);
  const { data: ticketData, mutate: mutateTicket } = useTicketDetail(ticketKey);
  const { data: reviewData } = useTicketReviews(ticketKey);
  const { sprints: rawSprints } = useJiraSprints();
  const latestReview = reviewData?.reviews?.[0];

  // Resolve sprint ids to display names so the header pill's hover card matches
  // the board (BRDG-276). Mirrors TicketRefPill's read-only enrichment.
  const sprintNames = useMemo(() => {
    const m: Record<string, string> = {};
    rawSprints.forEach((s) => { m[s.id] = s.name; });
    return m;
  }, [rawSprints]);
  const ticketHoverData = ticketData ? buildTicketHoverData(ticketData, sprintNames) : undefined;

  const { moreMenuRef, ...actions } = useStoryWriterActions({
    ticketKey,
    writer,
    ticketData: ticketData as Record<string, unknown> | undefined,
    mutateTicket: mutateTicket as (optimistic?: unknown, opts?: { revalidate: boolean }) => void,
    draftTitle,
    draftType,
    isDraft,
    isStillDraft,
    effectiveKey,
  });

  if (writer.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <PaneProvider ticketKey={ticketKey} initialEditorOpen={actions.initialEditorOpen}>
      <WriterProvider value={actions.writerContextValue}>
        <SplitModeSync />
        <div className="flex h-full flex-col">
          {/* Action bar */}
          <ViewHeader
            className="shrink-0"
            hideNotifications
            actions={<>
              {latestReview && (
                <div className="flex h-7 items-center gap-1 rounded-md bg-overlay-subtle px-2 text-label text-text-tertiary border border-border-subtle">
                  <Star size={11} strokeWidth={1.5} />
                  {Math.round(latestReview.overallScore)}
                </div>
              )}

              {actions.isDraftDirty && (
                <button
                  onClick={actions.handleSaveDraft}
                  disabled={actions.saving || actions.showSaved}
                  className={`flex h-7 items-center gap-1.5 rounded-md border px-3 text-body-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] transition-colors duration-150 disabled:cursor-not-allowed ${
                    actions.showSaved
                      ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
                      : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-list-item hover:text-text-secondary"
                  }`}
                >
                  {actions.saving
                    ? <Loader2 size={13} className="animate-spin" />
                    : actions.showSaved
                    ? <Check size={13} strokeWidth={2} />
                    : <Save size={13} strokeWidth={1.5} />
                  }
                  {actions.showSaved ? "Saved" : "Save draft"}
                </button>
              )}

              {!isStillDraft && (actions.hasLocalSave ? (
                <Button
                  variant="primary"
                  size="md"
                  icon={actions.pushing ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} strokeWidth={1.5} />}
                  onClick={actions.handlePush}
                  disabled={actions.pushing || actions.isDraftDirty}
                >
                  Push to Jira
                </Button>
              ) : actions.hasPushed ? (
                <Button
                  variant="primary"
                  size="md"
                  icon={<LogOut size={13} strokeWidth={1.5} />}
                  onClick={actions.handleCloseAfterPush}
                >
                  Close
                </Button>
              ) : actions.isDraftDirty ? (
                <Button
                  variant="primary"
                  size="md"
                  icon={actions.pushing ? <Loader2 size={13} className="animate-spin" /> : <SendHorizontal size={13} strokeWidth={1.5} />}
                  onClick={actions.handlePushAndClose}
                  disabled={actions.pushing}
                >
                  Push &amp; Close
                </Button>
              ) : null)}

              <div ref={moreMenuRef} className="relative">
                <Button
                  variant="ghost"
                  size="md"
                  iconOnly
                  icon={<MoreHorizontal size={14} strokeWidth={1.5} />}
                  onClick={() => actions.setShowMoreMenu((v) => !v)}
                  title="More actions"
                  className={actions.showMoreMenu ? "border-border-strong bg-overlay-strong text-text-secondary" : ""}
                />

                {actions.showMoreMenu && (
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1.5 shadow-[var(--shadow-lg)]">
                    {writer.session && (
                      <button
                        type="button"
                        onClick={() => { actions.handleSplitButtonClick(); actions.setShowMoreMenu(false); }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 ${
                          actions.splitModeVisible && actions.targetTicketKey
                            ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                            : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                        }`}
                      >
                        <Scissors size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>{actions.splitButtonLabel}</span>
                      </button>
                    )}

                    {!isStillDraft && (
                      <>
                        <div className="mx-2 my-1 h-px bg-overlay-default" />

                        {actions.hasLocalSave ? (
                          <button
                            type="button"
                            onClick={() => { actions.setShowMoreMenu(false); actions.handlePushAndClose(); }}
                            disabled={actions.pushing || actions.isDraftDirty}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <SendHorizontal size={13} strokeWidth={1.5} className="shrink-0" />
                            <span>Push &amp; Close</span>
                          </button>
                        ) : actions.hasPushed ? (
                          <button
                            type="button"
                            onClick={() => { actions.setShowMoreMenu(false); actions.handleCloseAfterPush(); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                          >
                            <LogOut size={13} strokeWidth={1.5} className="shrink-0" />
                            <span>Close</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { actions.setShowMoreMenu(false); actions.handlePush(); }}
                            disabled={actions.pushing || actions.isDraftDirty}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <CloudUpload size={13} strokeWidth={1.5} className="shrink-0" />
                            <span>Push to Jira</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => { actions.handlePullFromJira().finally(() => actions.setShowMoreMenu(false)); }}
                          disabled={actions.pulling}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {actions.pulling ? <Loader2 size={13} className="animate-spin shrink-0" /> : <CloudDownload size={13} strokeWidth={1.5} className="shrink-0" />}
                          <span>{actions.targetTicketKey && actions.splitModeVisible ? "Pull both from Jira" : "Pull from Jira"}</span>
                        </button>

                        <div className="mx-2 my-1 h-px bg-overlay-default" />

                        {actions.targetTicketKey && actions.splitModeVisible && (
                          <p className="px-3 pt-1 pb-0.5 text-caption font-medium uppercase tracking-wider text-text-muted">
                            Source: {ticketKey}
                          </p>
                        )}

                        <a
                          href={`{getJiraUrl(effectiveKey)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => actions.setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Open in Jira</span>
                        </a>
                      </>
                    )}

                    <Link
                      href={`/tickets/${ticketKey}`}
                      onClick={() => actions.setShowMoreMenu(false)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                    >
                      <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                      <span>View in Bridge</span>
                    </Link>

                    {!isStillDraft && ticketData && (
                      <>
                        <div className="mx-2 my-1 h-px bg-overlay-default" />
                        <button
                          type="button"
                          onClick={async () => {
                            const next = !(ticketData.flagged ?? false);
                            actions.setShowMoreMenu(false);
                            await actions.handleFlagChange(next);
                          }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <Flag size={13} strokeWidth={1.5} className={`shrink-0 ${ticketData.flagged ? "text-red-400" : ""}`} />
                          <span>{ticketData.flagged ? "Remove flag" : "Flag issue"}</span>
                        </button>
                      </>
                    )}

                    {!isStillDraft && (
                      <>
                        <div className="mx-2 my-1 h-px bg-overlay-default" />
                        <button
                          type="button"
                          onClick={() => { actions.setShowAddToRefinement(true); actions.setShowMoreMenu(false); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <Gem size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Add to refinement</span>
                        </button>
                      </>
                    )}

                    {actions.targetTicketKey && actions.splitModeVisible && (
                      <>
                        <div className="mx-2 my-1 h-px bg-overlay-default" />
                        <p className="px-3 pt-1 pb-0.5 text-caption font-medium uppercase tracking-wider text-text-muted">
                          Target: {actions.targetTicketKey}
                        </p>
                        <a
                          href={`{getJiraUrl(actions.targetTicketKey)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => actions.setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Open in Jira</span>
                        </a>
                        <Link
                          href={`/tickets/${actions.targetTicketKey}`}
                          onClick={() => actions.setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <ArrowUpRight size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>View in Bridge</span>
                        </Link>
                        <Link
                          href={`/tickets/${actions.targetTicketKey}/write`}
                          onClick={() => actions.setShowMoreMenu(false)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
                        >
                          <NotebookPen size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Open in Story Writer</span>
                        </Link>
                      </>
                    )}

                    {(((actions.isDraftDirty || actions.hasLocalSave) && writer.messages.length === 0) || writer.messages.length > 0) && (
                      <div className="mx-2 my-1 h-px bg-overlay-default" />
                    )}

                    {(actions.isDraftDirty || actions.hasLocalSave) && writer.messages.length === 0 && (
                      <button
                        type="button"
                        onClick={() => { actions.handleDelete(true); actions.setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-tertiary cursor-pointer hover:bg-red-500/[0.06] hover:text-red-400/80 transition-colors duration-150"
                      >
                        <Trash2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Discard draft</span>
                      </button>
                    )}

                    {writer.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { actions.setShowDeleteConfirm(true); actions.setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-tertiary cursor-pointer hover:bg-red-500/[0.06] hover:text-red-400/80 transition-colors duration-150"
                      >
                        <Trash2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Delete session</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>}
          >
            {(() => {
              const rawTitle = writer.session?.localTitle ?? ticketData?.title ?? draftTitle;
              const displayTitle = (rawTitle && rawTitle !== "Untitled draft") ? rawTitle : (draftTitle || "Untitled draft");
              const displayType = ticketData?.type ?? draftType;

              if (isStillDraft && draftSync.syncStatus === "pending") {
                return (
                  <>
                    <span className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2.5 py-1 text-label font-medium text-text-tertiary">
                      <span className="h-2 w-2 rounded-full bg-amber-400/60 animate-pulse" />
                      Syncing to Jira...
                    </span>
                    <ViewHeaderDivider />
                    <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                      {displayTitle}
                    </span>
                  </>
                );
              }

              if (!ticketData && isStillDraft) {
                return (
                  <>
                    {displayType && <IssueTypeIcon type={displayType} size={14} />}
                    <ViewHeaderDivider />
                    <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                      {displayTitle}
                    </span>
                  </>
                );
              }

              const status = (ticketData?.jiraStatus ?? "TO DO") as JiraStatus;
              return (
                <>
                  <TicketStatusPill
                    ticketKey={effectiveKey}
                    jiraStatus={status}
                    readiness={actions.localReadiness}
                    onJiraStatusChange={actions.handleJiraStatusChange}
                    onReadinessChange={actions.handleReadinessChange}
                    issueType={ticketData?.type ?? draftType}
                    onIssueTypeChange={actions.handleTypeChange}
                    title={displayTitle}
                    size="lg"
                    onHeader
                    hoverData={ticketHoverData}
                  />
                  <ViewHeaderDivider />
                  <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                    {displayTitle}
                  </span>
                </>
              );
            })()}
          </ViewHeader>

          {/* Push error */}
          {actions.pushError && (
            <div className="border-b border-red-500/20 bg-red-500/[0.04] px-4 py-2 text-body-sm text-red-400">
              {actions.pushError}
            </div>
          )}

          {/* Draft sync error */}
          {draftSync.syncStatus === "error" && (
            <div className="flex items-center gap-3 border-b border-amber-500/20 bg-amber-500/[0.04] px-4 py-2 text-body-sm text-amber-400">
              <span className="flex-1">Failed to create in Jira: {draftSync.error}. Your draft is saved locally.</span>
              <button
                type="button"
                onClick={draftSync.retry}
                className="shrink-0 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-body-sm font-medium text-amber-400 cursor-pointer hover:bg-amber-500/20 transition-colors duration-150"
              >
                Retry
              </button>
            </div>
          )}

          <ApplicationListBar />
          <AppToolbar />
          <PaneArea />

          <ConfirmDialog
            open={actions.showDeleteConfirm}
            onClose={() => actions.setShowDeleteConfirm(false)}
            title="Delete session?"
            description="This will discard the current drafts and AI suggestions. You can optionally keep the conversation history."
            confirmLabel="Delete everything"
            confirmClassName="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
            onConfirm={() => actions.handleDelete(true)}
            extraActions={
              <Button variant="ghost" size="md" onClick={() => actions.handleDelete(false)}>
                Discard, keep chat
              </Button>
            }
          />

          <ConfirmDialog
            open={actions.showRefinePrompt}
            onClose={() => window.history.back()}
            title="Mark as Ready to Refine?"
            description="The session has been cleared. Would you like to mark this ticket as ready for refinement?"
            cancelLabel="Skip"
            confirmLabel="Yes, mark as Ready to Refine"
            confirmVariant="primary"
            onConfirm={async () => {
              await actions.handleReadinessChange("ready_to_refine");
              window.history.back();
            }}
          />

          <AddToRefinementModal
            open={actions.showAddToRefinement}
            onClose={() => actions.setShowAddToRefinement(false)}
            ticketKeys={[ticketKey]}
          />

          <SplitStoryPicker
            open={actions.showSplitPicker}
            originalTitle={ticketData?.title ?? ticketKey}
            originalSprintId={ticketData?.sprintId ?? null}
            onConfirm={actions.handleSplitConfirm}
            onClose={() => actions.setShowSplitPicker(false)}
          />
        </div>
      </WriterProvider>
    </PaneProvider>
  );
}
