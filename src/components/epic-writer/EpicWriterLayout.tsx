"use client";

import { useMemo, useState, useCallback } from "react";
import { Loader2, CloudUpload, Save, Check } from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { StoryWriterChat } from "@/components/story-writer/StoryWriterChat";
import { ViewHeader } from "@/components/shared/ViewHeader";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { PhaseRail } from "./PhaseRail";
import { BreakdownBoard } from "./BreakdownBoard";
import { isEpicWriterPhase, type EpicWriterPhase } from "@/types/epic-writer";

interface EpicWriterLayoutProps {
  epicKey: string;
}

/**
 * Full-screen Epic Writer canvas. Reuses useStoryWriter (epic mode) and the
 * StoryWriterChat component unchanged. The PhaseRail sits on top; chat is the
 * primary surface. The breakdown board is added in later stories (293+); this
 * foundation focuses on a resumable, phase-aware sparring + epic-enrichment
 * surface.
 */
export function EpicWriterLayout({ epicKey }: EpicWriterLayoutProps) {
  const writer = useStoryWriter(epicKey, { mode: "epic" });
  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const [pushing, setPushing] = useState(false);

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

      <PhaseRail current={phase} onSelect={(p) => void writer.setPhase(p)} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-h-0 border-r border-border-subtle">
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
        <aside className="min-h-0 bg-surface-base/30">
          <BreakdownBoard
            cards={writer.cards}
            onDeepen={writer.deepenCard}
            onEditBody={writer.updateCardBody}
            onCreateInJira={writer.createCardInJira}
            onConfirmLink={writer.confirmCardLink}
            onReassignSprint={writer.reassignCardSprint}
            onGenerateBreakdown={writer.generateBreakdown}
            busy={writer.status === "sending" || writer.status === "streaming"}
          />
        </aside>
      </div>

      {toast && <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />}
    </div>
  );
}
