"use client";

import { useMemo, useState, useCallback } from "react";
import { Loader2, CloudUpload, Save, Check } from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { computeAcceptedDraftIds } from "@/lib/accepted-drafts";
import { StoryWriterChat } from "@/components/story-writer/StoryWriterChat";
import { ViewHeader } from "@/components/shared/ViewHeader";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { Button } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { PhaseRail } from "./PhaseRail";
import { BreakdownBoard } from "./BreakdownBoard";
import { EpicAppsMenu, type EpicRightView } from "./EpicAppsMenu";
import { EpicSprintPlanning } from "./EpicSprintPlanning";
import { StoryDraftEditor } from "./StoryDraftEditor";
import { ChildStoryView } from "./ChildStoryView";
import { LinkExistingStoryModal } from "./LinkExistingStoryModal";
import { useHorizontalSplit } from "./useHorizontalSplit";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { isEpicWriterPhase, type EpicWriterPhase } from "@/types/epic-writer";

interface EpicWriterLayoutProps {
  epicKey: string;
}

/**
 * Full-screen Epic Writer canvas. Reuses useStoryWriter (epic mode) and the
 * StoryWriterChat component unchanged; chat is the primary surface on the left.
 * The right region hosts three views, switched via the header Apps dropdown:
 * the breakdown board, an editable view of the epic's own draft (RichEditor,
 * BRDG-485), and - once a child story is created - that child story's own writer
 * in-place (ChildStoryView, BRDG-485). The chat / right split is resizable and
 * each column scrolls independently (bounded flex children).
 */
export function EpicWriterLayout({ epicKey }: EpicWriterLayoutProps) {
  const writer = useStoryWriter(epicKey, { mode: "epic" });
  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const [pushing, setPushing] = useState(false);
  const [rightMode, setRightMode] = useState<EpicRightView>("breakdown");
  const [openChildKey, setOpenChildKey] = useState<string | null>(null);
  const [showLinkExisting, setShowLinkExisting] = useState(false);
  const split = useHorizontalSplit(`ew:${epicKey}:split`);
  // Chat is a toggleable pane (BRDG-487 #3): hiding it gives the right region full
  // width. Persisted per-epic like the split ratio.
  const [chatVisible, setChatVisible] = useLocalStorage(`ew:${epicKey}:chat`, true);

  const { messageDraftMap, draftContentMap } = useMemo(() => {
    const msgMap: Record<string, string> = {};
    const contentMap: Record<string, string> = {};
    for (const draft of writer.aiDrafts) {
      if (draft.messageId) msgMap[draft.messageId] = draft.id;
      contentMap[draft.id] = draft.content;
    }
    return { messageDraftMap: msgMap, draftContentMap: contentMap };
  }, [writer.aiDrafts]);

  // BRDG-483: derive the accepted marker from persisted content. Epic drafts are
  // all original-slot; there is no target slot in the epic flow.
  const acceptedDraftIds = useMemo(
    () => computeAcceptedDraftIds(writer.aiDrafts, writer.session?.localDraft ?? null, null),
    [writer.aiDrafts, writer.session?.localDraft],
  );

  const phase: EpicWriterPhase = isEpicWriterPhase(writer.session?.phase)
    ? writer.session.phase
    : "feed";

  // Selecting a phase is a free bookmark (BRDG-479), but it now has a visible
  // effect (BRDG-484): it focuses the right region on the artifact that phase is
  // about - the epic draft in the early phases, the breakdown board while
  // decomposing (both Breakdown and Refine work on the board; Refine deepens the
  // cards there, BRDG-488), and the sprint-planning view once the PO reaches
  // Sprints (BRDG-486). The PO can still switch views manually at any time.
  const handleSelectPhase = useCallback(
    (p: EpicWriterPhase) => {
      void writer.setPhase(p);
      setRightMode(
        p === "feed" || p === "discovery" ? "draft" : p === "sprints" ? "sprints" : "breakdown",
      );
    },
    [writer],
  );

  // Open a created child story in-place (BRDG-485): it becomes a third content
  // view (listed in the Apps dropdown). One child at a time.
  const handleOpenChild = useCallback((jiraKey: string) => {
    setOpenChildKey(jiraKey);
    setRightMode("child");
  }, []);

  const handleCloseChild = useCallback(() => {
    setOpenChildKey(null);
    setRightMode("breakdown");
  }, []);

  // Re-parent existing stories into the epic (BRDG-487) and surface the outcome.
  const handleLinkExisting = useCallback(
    async (jiraKeys: string[]) => {
      const res = await writer.linkExistingChildren(jiraKeys);
      setRightMode("breakdown");
      if (!res) {
        showToast("Could not link the stories");
        return;
      }
      const linkedCount = res.linked.length;
      if (linkedCount === 0) {
        showToast("No stories were linked");
      } else if (res.failed.length > 0) {
        showToast(`Linked ${linkedCount}; ${res.failed.length} could not be linked`);
      } else {
        showToast(linkedCount === 1 ? "Linked 1 story to the epic" : `Linked ${linkedCount} stories to the epic`);
      }
    },
    [writer, showToast],
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
  // Guard against a stale "child" selection after the child was closed.
  const effectiveMode: EpicRightView =
    rightMode === "child" && !openChildKey ? "breakdown" : rightMode;

  return (
    <div className="flex h-full flex-col">
      <ViewHeader
        className="shrink-0"
        hideNotifications
        actions={
          <>
            {/* Content-view switcher, matching the Story Writer's Apps affordance.
                Chat is listed as a toggleable pane (BRDG-487 #3). */}
            <EpicAppsMenu
              view={effectiveMode}
              onSelect={setRightMode}
              childKey={openChildKey}
              chatVisible={chatVisible}
              onToggleChat={() => setChatVisible((v) => !v)}
            />

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
        {chatVisible && (
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
              onClearChat={writer.clearChat}
              messageDraftMap={messageDraftMap}
              draftContentMap={draftContentMap}
              acceptedDraftIds={acceptedDraftIds}
              onAcceptDraft={writer.acceptDraft}
            />
          </div>
        )}

        {/* Resizable divider (BRDG-484): drag to rebalance chat vs. right region;
            the ratio persists in localStorage like other layout prefs. Hidden when
            the chat pane is toggled off (BRDG-487 #3) - nothing to resize. */}
        {chatVisible && (
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
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base/30">
          {/* Each view owns its own header/chrome; the switcher lives in the
              header Apps dropdown so there is a single, consistent affordance. */}
          {effectiveMode === "breakdown" && (
            <BreakdownBoard
              cards={writer.cards}
              onDeepen={writer.deepenCard}
              onEditBody={writer.updateCardBody}
              onCreateInJira={writer.createCardInJira}
              onConfirmLink={writer.confirmCardLink}
              onReassignSprint={writer.reassignCardSprint}
              onGenerateBreakdown={writer.generateBreakdown}
              onOpenChild={handleOpenChild}
              onLinkExisting={() => setShowLinkExisting(true)}
              onReorder={writer.reorderCards}
              busy={writer.status === "sending" || writer.status === "streaming"}
            />
          )}
          {effectiveMode === "sprints" && (
            <EpicSprintPlanning
              epicKey={epicKey}
              onSelectChild={handleOpenChild}
              onChildChanged={() => void writer.refreshSession()}
            />
          )}
          {effectiveMode === "draft" && (
            <StoryDraftEditor
              localDraft={writer.session?.localDraft ?? ""}
              onChange={writer.updateLocalDraft}
              placeholder="Work out the epic description…"
            />
          )}
          {effectiveMode === "child" && openChildKey && (
            <ChildStoryView
              key={openChildKey}
              childKey={openChildKey}
              onClose={handleCloseChild}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      <LinkExistingStoryModal
        open={showLinkExisting}
        epicKey={epicKey}
        onClose={() => setShowLinkExisting(false)}
        onLink={handleLinkExisting}
      />

      {toast && <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />}
    </div>
  );
}
