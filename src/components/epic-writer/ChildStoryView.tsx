"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import { Loader2, CloudUpload, Save, Check, X, LayoutGrid, ChevronDown, FileText, MessageSquare } from "lucide-react";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { StoryWriterChat } from "@/components/story-writer/StoryWriterChat";
import { StoryDraftEditor } from "./StoryDraftEditor";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { MenuItem, MenuList } from "@/components/shared/MenuItem";
import { Button } from "@/components/ui/Button";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { ShowToast } from "@/hooks/useToast";

interface ChildStoryViewProps {
  childKey: string;
  onClose: () => void;
  showToast: ShowToast;
}

/**
 * Editor / Chat pane toggles for the child edit view (BRDG-490 #3). Mirrors the
 * Epic Writer's EpicAppsMenu check-item model (BRDG-487 #3) rather than inventing
 * a second toggling affordance, so the two views feel consistent. The parent
 * enforces that at least one pane stays visible.
 */
function ChildPanesMenu({
  editorVisible,
  chatVisible,
  onToggleEditor,
  onToggleChat,
}: {
  editorVisible: boolean;
  chatVisible: boolean;
  onToggleEditor: () => void;
  onToggleChat: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        icon={<LayoutGrid size={12} strokeWidth={1.5} />}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Panes
        <ChevronDown
          size={11}
          strokeWidth={1.75}
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <MenuList className="absolute right-0 top-full z-30 mt-1.5 w-44" aria-label="Panes">
          <MenuItem icon={<FileText size={13} strokeWidth={1.5} />} active={editorVisible} onClick={onToggleEditor}>
            <span className="min-w-0 flex-1 truncate text-left">Editor</span>
            {editorVisible && <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />}
          </MenuItem>
          <MenuItem icon={<MessageSquare size={13} strokeWidth={1.5} />} active={chatVisible} onClick={onToggleChat}>
            <span className="min-w-0 flex-1 truncate text-left">Chat</span>
            {chatVisible && <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />}
          </MenuItem>
        </MenuList>
      )}
    </div>
  );
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

  // Toggleable panes (BRDG-490 #3): instead of a forced 50/50 split, the PO can
  // turn the editor or chat off to give the other full height. Persisted per
  // child; at least one pane must stay visible (hiding the last one is a no-op).
  const [editorVisible, setEditorVisible] = useLocalStorage(`ew:child:${childKey}:editor`, true);
  const [chatVisible, setChatVisible] = useLocalStorage(`ew:child:${childKey}:chat`, true);
  const toggleEditor = useCallback(() => {
    setEditorVisible((v) => (v && !chatVisible ? v : !v));
  }, [chatVisible, setEditorVisible]);
  const toggleChat = useCallback(() => {
    setChatVisible((v) => (v && !editorVisible ? v : !v));
  }, [editorVisible, setChatVisible]);

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
        <ChildPanesMenu
          editorVisible={editorVisible}
          chatVisible={chatVisible}
          onToggleEditor={toggleEditor}
          onToggleChat={toggleChat}
        />
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
          {/* Description editor (top). Toggleable (BRDG-490 #3): hidden gives the
              chat full height; the bottom border only shows when both panes are up. */}
          {editorVisible && (
            <div className={`flex min-h-0 flex-1 flex-col ${chatVisible ? "border-b border-border-subtle" : ""}`}>
              <StoryDraftEditor
                localDraft={child.session?.localDraft ?? ""}
                onChange={child.updateLocalDraft}
                placeholder="Work out the story description…"
              />
            </div>
          )}
          {/* Refine chat (bottom). Toggleable (BRDG-490 #3). */}
          {chatVisible && (
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
              onClearChat={child.clearChat}
              onCancel={child.cancelCurrentTask}
              messageDraftMap={messageDraftMap}
              draftContentMap={draftContentMap}
              onAcceptDraft={child.acceptDraft}
            />
          </div>
          )}
        </div>
      )}
    </div>
  );
}
