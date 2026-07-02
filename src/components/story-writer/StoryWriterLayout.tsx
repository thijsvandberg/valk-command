"use client";

import { useEffect, useMemo } from "react";
import {
  CloudUpload,
  CloudDownload,
  Check,
  Trash2,
  Loader2,
  Star,
  Scissors,
  Flag,
  MoreHorizontal,
  ArrowUpRight,
  NotebookPen,
  Gem,
  CheckCircle2,
  Archive,
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
import { ViewHeader } from "@/components/shared/ViewHeader";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { buildTicketHoverData } from "@/hooks/useTicketHoverData";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PaneProvider, usePaneContext } from "./panes/PaneContext";
import { WriterProvider, useWriterContext } from "./panes/WriterContext";
import { AppsMenu } from "./panes/AppsMenu";
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

  const { moreMenuRef, wrapUpMenuRef, ...actions } = useStoryWriterActions({
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
            hideContextDivider
            actions={<>
              {latestReview && (
                <div className="flex h-7 items-center gap-1 rounded-md bg-overlay-subtle px-2 text-label text-text-tertiary border border-border-subtle">
                  <Star size={11} strokeWidth={1.5} />
                  {Math.round(latestReview.overallScore)}
                </div>
              )}

              {/* Autosave indicator: edits persist on their own; this only reports it. */}
              {writer.draftSaveState !== "idle" && (
                <span className="flex items-center gap-1.5 pr-1 text-label font-medium text-text-muted">
                  {writer.draftSaveState === "saving" ? (
                    <>
                      <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check size={12} strokeWidth={2} className="text-[var(--color-brand-400)]" />
                      Saved
                    </>
                  )}
                </span>
              )}

              {/* Pane apps live behind this dropdown since BRDG-460 replaced the
                  ApplicationListBar toggle bar. */}
              <AppsMenu />

              {/* Wrap up: the one primary action. Always pushes & closes the editor;
                  the panel only decides readiness and whether the chat is kept. */}
              {!isStillDraft && (
                <div ref={wrapUpMenuRef} className="relative">
                  <Button
                    variant="primary"
                    size="md"
                    icon={actions.pushing ? <Loader2 size={13} className="animate-spin" /> : <Flag size={13} strokeWidth={1.75} />}
                    onClick={() => actions.setShowWrapUpMenu((v: boolean) => !v)}
                    disabled={actions.pushing}
                    aria-expanded={actions.showWrapUpMenu}
                  >
                    Wrap up
                  </Button>

                  {actions.showWrapUpMenu && (
                    <div className="absolute right-0 top-full z-30 mt-2 w-[320px] rounded-2xl border border-border-strong bg-surface-floating p-2 shadow-lg">
                      <p className="px-2 pb-0.5 pt-1 text-caption font-semibold uppercase tracking-label text-text-muted">
                        Wrap up this story
                      </p>
                      <p className="px-2 pb-2 text-label leading-[1.5] text-text-tertiary">
                        Pushes to Jira &amp; closes the editor.
                      </p>
                      <button
                        type="button"
                        onClick={actions.handleWrapUpReady}
                        className="group flex w-full items-start gap-3 rounded-xl p-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)]/[0.08] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-status-done-subtle)] text-[var(--color-status-done)] transition-colors duration-150">
                          <CheckCircle2 size={16} strokeWidth={1.75} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-body-sm font-semibold text-text-primary">Ready to refine</span>
                          <span className="text-label leading-[1.55] text-text-tertiary">
                            Marks the story Ready to refine. The chat session is kept for later.
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={actions.handleWrapUpReadyClear}
                        className="group flex w-full items-start gap-3 rounded-xl p-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)]/[0.08] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-status-done-subtle)] text-[var(--color-status-done)] transition-colors duration-150">
                          <Archive size={16} strokeWidth={1.75} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-body-sm font-semibold text-text-primary">Ready to refine + clear session</span>
                          <span className="text-label leading-[1.55] text-text-tertiary">
                            Same, but also archives this chat. The story is fully done.
                          </span>
                        </span>
                      </button>
                      <div className="mx-2 my-1 h-px bg-overlay-default" />
                      <button
                        type="button"
                        onClick={actions.handleWrapUpClose}
                        className="group flex w-full items-start gap-3 rounded-xl p-2.5 text-left cursor-pointer transition-colors duration-150 hover:bg-hover-interactive focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-overlay-default text-text-tertiary transition-colors duration-150 group-hover:bg-overlay-strong">
                          <Trash2 size={15} strokeWidth={1.75} />
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-body-sm font-semibold text-text-primary">Close as-is</span>
                          <span className="text-label leading-[1.55] text-text-tertiary">
                            Leaves readiness untouched. The story is parked, not flagged for refinement.
                          </span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                  <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-border-strong bg-surface-floating py-1.5 shadow-lg">
                    {writer.session && (
                      <button
                        type="button"
                        onClick={() => { actions.handleSplitButtonClick(); actions.setShowMoreMenu(false); }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 ${
                          actions.splitModeVisible && actions.targetTicketKey
                            ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08]"
                            : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                        } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                      >
                        <Scissors size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>{actions.splitButtonLabel}</span>
                      </button>
                    )}

                    {!isStillDraft && (
                      <>
                        <div className="mx-2 my-1 h-px bg-overlay-default" />

                        <button
                          type="button"
                          onClick={() => { actions.setShowMoreMenu(false); actions.handlePush(); }}
                          disabled={actions.pushing || !actions.isDraftDirty}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                        >
                          <CloudUpload size={13} strokeWidth={1.5} className="shrink-0" />
                          <span>Push to Jira (stay open)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { actions.handlePullFromJira().finally(() => actions.setShowMoreMenu(false)); }}
                          disabled={actions.pulling}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                        >
                          <Flag size={13} strokeWidth={1.5} className={`shrink-0 ${ticketData.flagged ? "text-[var(--color-status-error)]" : ""}`} />
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
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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

                    {((actions.isDraftDirty && writer.messages.length === 0) || writer.messages.length > 0) && (
                      <div className="mx-2 my-1 h-px bg-overlay-default" />
                    )}

                    {actions.isDraftDirty && writer.messages.length === 0 && (
                      <button
                        type="button"
                        onClick={() => { actions.handleDelete(true); actions.setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-tertiary cursor-pointer hover:bg-[var(--color-status-error)]/[0.06] hover:text-[var(--color-status-error)]/80 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                      >
                        <Trash2 size={13} strokeWidth={1.5} className="shrink-0" />
                        <span>Discard draft</span>
                      </button>
                    )}

                    {writer.messages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { actions.setShowDeleteConfirm(true); actions.setShowMoreMenu(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-tertiary cursor-pointer hover:bg-[var(--color-status-error)]/[0.06] hover:text-[var(--color-status-error)]/80 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
                      <span className="h-2 w-2 rounded-full bg-[var(--color-status-warning)]/60 animate-pulse" />
                      Syncing to Jira...
                    </span>
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
                  <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
                    {displayTitle}
                  </span>
                </>
              );
            })()}
          </ViewHeader>

          {/* Push error */}
          {actions.pushError && (
            <div className="border-b border-[var(--color-status-error)]/20 bg-[var(--color-status-error)]/[0.04] px-4 py-2 text-body-sm text-[var(--color-status-error)]">
              {actions.pushError}
            </div>
          )}

          {/* Cross-tab draft conflict: autosave is paused until resolved */}
          {writer.draftConflict && (
            <div className="flex items-center gap-3 border-b border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/[0.04] px-4 py-2 text-body-sm text-[var(--color-status-warning)]">
              <span className="flex-1">This draft was changed in another tab. Autosave is paused.</span>
              <button
                type="button"
                onClick={() => writer.resolveDraftConflict("reload")}
                className="shrink-0 rounded-md border border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/10 px-2.5 py-1 text-body-sm font-medium text-[var(--color-status-warning)] cursor-pointer hover:bg-[var(--color-status-warning)]/20 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                Reload draft
              </button>
              <button
                type="button"
                onClick={() => writer.resolveDraftConflict("overwrite")}
                className="shrink-0 rounded-md border border-[var(--color-status-warning)]/20 px-2.5 py-1 text-body-sm font-medium text-[var(--color-status-warning)]/80 cursor-pointer hover:bg-[var(--color-status-warning)]/10 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                Overwrite
              </button>
            </div>
          )}

          {/* Draft sync error */}
          {draftSync.syncStatus === "error" && (
            <div className="flex items-center gap-3 border-b border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/[0.04] px-4 py-2 text-body-sm text-[var(--color-status-warning)]">
              <span className="flex-1">Failed to create in Jira: {draftSync.error}. Your draft is saved locally.</span>
              <button
                type="button"
                onClick={draftSync.retry}
                className="shrink-0 rounded-md border border-[var(--color-status-warning)]/20 bg-[var(--color-status-warning)]/10 px-2.5 py-1 text-body-sm font-medium text-[var(--color-status-warning)] cursor-pointer hover:bg-[var(--color-status-warning)]/20 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                Retry
              </button>
            </div>
          )}

          <AppToolbar />
          <PaneArea />

          <ConfirmDialog
            open={actions.showDeleteConfirm}
            onClose={() => actions.setShowDeleteConfirm(false)}
            title="Delete session?"
            description="This will discard the current drafts and AI suggestions. You can optionally keep the conversation history."
            confirmLabel="Delete everything"
            confirmClassName="bg-[var(--color-status-error)]/10 border border-[var(--color-status-error)]/20 hover:bg-[var(--color-status-error)]/20"
            onConfirm={() => actions.handleDelete(true)}
            extraActions={
              <Button variant="ghost" size="md" onClick={() => actions.handleDelete(false)}>
                Discard, keep chat
              </Button>
            }
          />

          <AddToRefinementModal
            open={actions.showAddToRefinement}
            onClose={actions.handleAddToRefinementClose}
            ticketKeys={[ticketKey]}
            cancelLabel="Skip"
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
