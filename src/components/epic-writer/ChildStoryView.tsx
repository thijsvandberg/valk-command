"use client";

import { useMemo, useState, useCallback } from "react";
import { Loader2, CloudUpload, Save, Check, X } from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { StoryWriterChat } from "@/components/story-writer/StoryWriterChat";
import { StoryDraftEditor } from "./StoryDraftEditor";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { Button } from "@/components/ui/Button";
import type { ShowToast } from "@/hooks/useToast";

interface ChildStoryViewProps {
  childKey: string;
  onClose: () => void;
  showToast: ShowToast;
}

/**
 * In-place child-story writer inside the Epic Writer (BRDG-485). Runs its own
 * useStoryWriter in normal story mode against the child ticket - fully separate
 * from the epic session - and reuses the prop-driven StoryWriterChat + RichEditor
 * so the PO can edit + refine the child story without leaving the Epic Writer.
 * One child is mounted at a time; Save/Push target the child ticket.
 */
export function ChildStoryView({ childKey, onClose, showToast }: ChildStoryViewProps) {
  const child = useStoryWriter(childKey);
  const [pushing, setPushing] = useState(false);

  const { messageDraftMap, draftContentMap } = useMemo(() => {
    const msgMap: Record<string, string> = {};
    const contentMap: Record<string, string> = {};
    for (const draft of child.aiDrafts) {
      if (draft.messageId) msgMap[draft.messageId] = draft.id;
      contentMap[draft.id] = draft.content;
    }
    return { messageDraftMap: msgMap, draftContentMap: contentMap };
  }, [child.aiDrafts]);

  const handleSaveDraft = useCallback(async () => {
    const session = child.session;
    if (!(session?.localDraft || session?.localTitle)) {
      showToast("Nothing to save yet");
      return;
    }
    try {
      await child.saveDraft();
      showToast(`Draft saved for ${childKey}`);
    } catch {
      showToast("Could not save the draft");
    }
  }, [child, childKey, showToast]);

  const handlePush = useCallback(async () => {
    const session = child.session;
    if (!(session?.localDraft || session?.localTitle)) {
      showToast("Nothing to push to Jira yet");
      return;
    }
    setPushing(true);
    showToast(`Pushing ${childKey} to Jira…`, 0, { loading: true });
    try {
      const result = await child.pushToJira();
      if (result.success) {
        showToast(`Pushed ${childKey} to Jira`);
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
  }, [child, childKey, showToast]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2">
        <TicketRefPill ticketKey={childKey} />
        <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-secondary">
          {child.session?.localTitle || ""}
        </span>
        {child.draftSaveState !== "idle" && (
          <span className="flex items-center gap-1 text-label font-medium text-text-muted">
            {child.draftSaveState === "saving" ? (
              <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <Check size={11} strokeWidth={2} className="text-[var(--color-brand-400)]" />
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSaveDraft()}
          title="Save draft"
          className="flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2.5 text-label font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
        >
          <Save size={12} strokeWidth={1.5} />
          Save
        </button>
        <Button
          variant="primary"
          size="sm"
          disabled={pushing}
          icon={
            pushing
              ? <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
              : <CloudUpload size={12} strokeWidth={1.5} />
          }
          onClick={() => void handlePush()}
        >
          Push
        </Button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close child story"
          title="Close"
          className="flex size-7 items-center justify-center rounded-md text-text-muted cursor-pointer transition-colors duration-150 hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>

      {child.status === "loading" ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Description editor (top) */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-border-subtle">
            <StoryDraftEditor
              localDraft={child.session?.localDraft ?? ""}
              onChange={child.updateLocalDraft}
              placeholder="Work out the story description…"
            />
          </div>
          {/* Refine chat (bottom) */}
          <div className="flex min-h-0 flex-1 flex-col">
            <StoryWriterChat
              messages={child.messages}
              status={child.status}
              streamProgress={child.streamProgress}
              streamError={child.streamError}
              usage={child.usage}
              lastResponseDurationMs={child.lastResponseDurationMs}
              localDraft={child.session?.localDraft ?? null}
              codebaseResearch={child.codebaseResearch}
              onCodebaseResearchChange={child.setCodbaseResearch}
              model={child.model}
              onModelChange={child.setModel}
              onSend={child.sendMessage}
              onRetry={child.retryMessage}
              onDismissFailed={child.dismissFailedMessage}
              onCancel={child.cancelCurrentTask}
              messageDraftMap={messageDraftMap}
              draftContentMap={draftContentMap}
              onAcceptDraft={child.acceptDraft}
            />
          </div>
        </div>
      )}
    </div>
  );
}
