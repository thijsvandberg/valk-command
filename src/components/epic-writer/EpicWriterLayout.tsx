"use client";

import { useMemo, useState, useCallback } from "react";
import { Loader2, CloudUpload, Save, Check, LayoutList, FileText } from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { StoryWriterChat } from "@/components/story-writer/StoryWriterChat";
import { ViewHeader } from "@/components/shared/ViewHeader";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { PaneProvider } from "@/components/story-writer/panes/PaneContext";
import { WriterProvider } from "@/components/story-writer/panes/WriterContext";
import { StoryPreviewApp } from "@/components/story-writer/panes/apps/StoryPreviewApp";
import { PhaseRail } from "./PhaseRail";
import { BreakdownBoard } from "./BreakdownBoard";
import { useHorizontalSplit } from "./useHorizontalSplit";
import { useEpicWriterContext } from "./useEpicWriterContext";
import { isEpicWriterPhase, type EpicWriterPhase } from "@/types/epic-writer";

interface EpicWriterLayoutProps {
  epicKey: string;
}

type RightMode = "breakdown" | "draft";

/**
 * Full-screen Epic Writer canvas. Reuses useStoryWriter (epic mode) and the
 * StoryWriterChat component unchanged. The PhaseRail sits on top; chat is the
 * primary surface on the left. The right region hosts the breakdown board and,
 * via the Story Writer's own StoryPreviewApp (BRDG-484), a read-only view of the
 * saved epic draft. The chat / right split is resizable and each column scrolls
 * independently (the two are bounded flex children, so their own overflow-y-auto
 * scrolls instead of the page).
 */
export function EpicWriterLayout({ epicKey }: EpicWriterLayoutProps) {
  const writer = useStoryWriter(epicKey, { mode: "epic" });
  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const [pushing, setPushing] = useState(false);
  const [rightMode, setRightMode] = useState<RightMode>("breakdown");
  const split = useHorizontalSplit(`ew:${epicKey}:split`);
  const writerContextValue = useEpicWriterContext(writer, epicKey);

  const { messageDraftMap, draftContentMap } = useMemo(() => {
    const msgMap: Record<string, string> = {};
    const contentMap: Record<string, string> = {};
    for (const draft of writer.aiDrafts) {
      if (draft.messageId) msgMap[draft.messageId] = draft.id;
      contentMap[draft.id] = draft.content;
    }
    return { messageDraftMap: msgMap, draftContentMap: contentMap };
  }, [writer.aiDrafts]);

  const phase: EpicWriterPhase = isEpicWriterPhase(writer.session?.phase)
    ? writer.session.phase
    : "feed";

  // Selecting a phase is a free bookmark (BRDG-479), but it now has a visible
  // effect (BRDG-484): it focuses the right region on the artifact that phase is
  // about - the epic draft in the early phases, the breakdown board once the PO
  // is decomposing. The PO can still switch views manually at any time.
  const handleSelectPhase = useCallback(
    (p: EpicWriterPhase) => {
      void writer.setPhase(p);
      setRightMode(p === "feed" || p === "discovery" ? "draft" : "breakdown");
    },
    [writer],
  );

  // Save draft feedback (BRDG-478): the autosave still runs on its own; this is
  // the explicit flush. Report the outcome so the action never looks like a
  // silent no-op, and surface the "nothing to save yet" case.
  const handleSaveDraft = useCallback(async () => {
    const session = writer.session;
    const hasContent = !!(session?.localDraft || session?.localTitle);
    if (!hasContent) {
      showToast("Nothing to save yet");
      return;
    }
    try {
      await writer.saveDraft();
      showToast("Draft saved");
    } catch {
      showToast("Could not save the draft");
    }
  }, [writer, showToast]);

  // Push to Jira feedback (BRDG-478): mirrors the single-story Story Writer's
  // success / conflict / error messaging so the PO gets confirmation instead of
  // silence.
  const handlePush = useCallback(async () => {
    const session = writer.session;
    const hasContent = !!(session?.localDraft || session?.localTitle);
    if (!hasContent) {
      showToast("Nothing to push to Jira yet");
      return;
    }
    setPushing(true);
    showToast("Pushing to Jira…", 0, { loading: true });
    try {
      const result = await writer.pushToJira();
      if (result.success) {
        showToast("Pushed to Jira");
      } else if (result.conflict) {
        showToast(
          result.contentChanged
            ? "Jira was updated externally. Review the diff on the ticket detail page."
            : "Metadata changed in Jira. Try pushing again.",
        );
      } else {
        showToast("Nothing to push to Jira yet");
      }
    } catch {
      showToast("Push to Jira failed");
    } finally {
      setPushing(false);
    }
  }, [writer, showToast]);

  if (writer.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  const title = writer.session?.localTitle || epicKey;

  return (
    <PaneProvider ticketKey={epicKey} initialEditorOpen={false}>
      <WriterProvider value={writerContextValue}>
        <div className="flex h-full flex-col">
          <ViewHeader
            className="shrink-0"
            hideNotifications
            actions={
              <>
                {/* Autosave indicator: edits persist on their own; this reports it,
                    and the explicit Save draft below flushes + toasts. */}
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
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-3 text-body-sm font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                >
                  <Save size={13} strokeWidth={1.5} />
                  Save draft
                </button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={pushing}
                  icon={
                    pushing
                      ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                      : <CloudUpload size={13} strokeWidth={1.5} />
                  }
                  onClick={() => void handlePush()}
                >
                  Push to Jira
                </Button>
              </>
            }
          >
            <TicketRefPill ticketKey={epicKey} />
            <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">
              {title}
            </span>
          </ViewHeader>

          <PhaseRail current={phase} onSelect={handleSelectPhase} />

          <div ref={split.containerRef} className="flex min-h-0 flex-1">
            <div
              className="flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-border-subtle"
              style={{ width: `${split.leftPct}%` }}
            >
              <StoryWriterChat
                messages={writer.messages}
                status={writer.status}
                streamProgress={writer.streamProgress}
                streamError={writer.streamError}
                usage={writer.usage}
                lastResponseDurationMs={writer.lastResponseDurationMs}
                localDraft={writer.session?.localDraft ?? null}
                codebaseResearch={writer.codebaseResearch}
                onCodebaseResearchChange={writer.setCodbaseResearch}
                model={writer.model}
                onModelChange={writer.setModel}
                onSend={writer.sendMessage}
                onRetry={writer.retryMessage}
                onDismissFailed={writer.dismissFailedMessage}
                onCancel={writer.cancelCurrentTask}
                messageDraftMap={messageDraftMap}
                draftContentMap={draftContentMap}
                onAcceptDraft={writer.acceptDraft}
              />
            </div>

            {/* Resizable divider (BRDG-484): drag to rebalance chat vs. right region;
                the ratio persists in localStorage like other layout prefs. */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize panels"
              onMouseDown={split.onHandleMouseDown}
              className={`group relative z-10 flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors duration-150 hover:bg-[var(--color-brand-500)]/20 ${
                split.dragging ? "bg-[var(--color-brand-500)]/30" : ""
              }`}
            >
              <div className="h-8 w-0.5 rounded-full bg-overlay-strong transition-colors duration-150 group-hover:bg-[var(--color-brand-500)]/40" />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base/30">
              {/* Region header: one place to switch between the breakdown board and
                  the saved epic draft (BRDG-484). */}
              <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
                <div className="flex items-center gap-0.5 rounded-md border border-border-subtle bg-overlay-subtle p-0.5">
                  <RightModeButton
                    active={rightMode === "breakdown"}
                    onClick={() => setRightMode("breakdown")}
                    icon={<LayoutList size={12} strokeWidth={1.5} />}
                    label="Breakdown"
                  />
                  <RightModeButton
                    active={rightMode === "draft"}
                    onClick={() => setRightMode("draft")}
                    icon={<FileText size={12} strokeWidth={1.5} />}
                    label="Draft"
                  />
                </div>
                {rightMode === "breakdown" && writer.cards.length > 0 && (
                  <span className="text-label text-text-muted tabular-nums">
                    {writer.cards.length} stories
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {rightMode === "breakdown" ? (
                  <BreakdownBoard
                    cards={writer.cards}
                    onDeepen={writer.deepenCard}
                    onEditBody={writer.updateCardBody}
                    onCreateInJira={writer.createCardInJira}
                    onConfirmLink={writer.confirmCardLink}
                    onReassignSprint={writer.reassignCardSprint}
                    onGenerateBreakdown={writer.generateBreakdown}
                    busy={writer.status === "sending" || writer.status === "streaming"}
                    hideHeader
                  />
                ) : (
                  <StoryPreviewApp />
                )}
              </div>
            </div>
          </div>

          {toast && <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />}
        </div>
      </WriterProvider>
    </PaneProvider>
  );
}

function RightModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-caption font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
        active
          ? "bg-surface-floating text-text-secondary shadow-sm"
          : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
