"use client";

import { useState, useEffect, useMemo } from "react";
import { ScrollText } from "lucide-react";
import type { IssueType } from "@/types/ticket";
import { StoryWriterChat } from "@/components/story-writer/StoryWriterChat";
import { ExecutionLogViewer } from "@/components/story-writer/ExecutionLogViewer";
import { WorkspaceStatusBadge } from "@/components/story-writer/WorkspaceStatusBadge";
import { tickets } from "@/lib/api-client";
import { computeAcceptedDraftIds } from "@/lib/accepted-drafts";
import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

export function ChatApp() {
  const writer = useWriterContext();
  const pane = usePaneContext();
  const { registerToolbar, unregisterToolbar } = pane;
  const [showLogs, setShowLogs] = useState(false);

  const { messageDraftMap, draftContentMap } = useMemo(() => {
    const msgMap: Record<string, string> = {};
    const contentMap: Record<string, string> = {};
    for (const draft of [...writer.aiDrafts, ...writer.targetAiDrafts]) {
      if (draft.messageId) {
        msgMap[draft.messageId] = draft.id;
      }
      contentMap[draft.id] = draft.content;
    }
    return { messageDraftMap: msgMap, draftContentMap: contentMap };
  }, [writer.aiDrafts, writer.targetAiDrafts]);

  // BRDG-483: derive the accepted marker from persisted session content so it
  // survives a refresh (both slots), instead of relying on click-only state.
  const acceptedDraftIds = useMemo(
    () =>
      computeAcceptedDraftIds(
        [...writer.aiDrafts, ...writer.targetAiDrafts],
        writer.session?.localDraft ?? null,
        writer.session?.targetLocalDraft ?? null,
      ),
    [writer.aiDrafts, writer.targetAiDrafts, writer.session?.localDraft, writer.session?.targetLocalDraft],
  );

  const handleViewDraft = (draftId: string) => {
    const content = draftContentMap[draftId];
    const draft = writer.aiDrafts.find((d) => d.id === draftId);
    const label = draft ? `AI Draft ${draft.draftIndex + 1}` : "Draft";
    if (content) {
      pane.openDraftPreview(content, label, draftId);
    }
  };

  const handleAcceptDraft = async (draftId: string) => {
    await writer.onAcceptDraft(draftId);
    pane.openApp("editor");
  };

  const handleFocusDraft = (draftId: string) => {
    const content = draftContentMap[draftId];
    const draft = writer.aiDrafts.find((d) => d.id === draftId);
    const label = draft ? `AI Draft ${draft.draftIndex + 1}` : "Draft";
    if (content) {
      pane.focusDraftPreview(content, label, draftId);
    }
  };

  const handleShowDiff = (draftId: string) => {
    pane.openDiffForDraft(draftId);
  };

  const handleFindRelated = async () => {
    await writer.onSend("Find related stories", "find-related");
  };

  // BRDG-435: post an investigation result straight to Jira as a comment. The
  // card owns the posting/posted/error state, so this just performs the write
  // (letting a rejection propagate) and refreshes the ticket so the comment
  // shows live on the detail view.
  const handlePostInvestigation = async (text: string) => {
    await tickets.addJiraComment(writer.ticketKey, { content: text });
    writer.mutateTicket();
  };

  const handleOpenRelatedPanel = () => {
    pane.openRelated();
  };

  const handleStoryKeyClick = (key: string) => {
    pane.openRelated(key);
  };

  // Register toolbar slot — re-register when showLogs or counts change
  useEffect(() => {
    registerToolbar("chat", {
      label: "Chat",
      actions: (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowLogs(false)}
            className={`rounded px-2 py-1 text-caption font-medium cursor-pointer ${
              !showLogs
                ? "text-text-secondary bg-overlay-default"
                : "text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setShowLogs(true)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-caption font-medium cursor-pointer ${
              showLogs
                ? "text-text-secondary bg-overlay-default"
                : "text-text-tertiary hover:text-text-secondary hover:bg-hover-list-item"
            } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
          >
            <ScrollText size={10} strokeWidth={1.5} />
            Logs
          </button>
          {(writer.aiDrafts.length > 0 || writer.messages.length > 0) && (
            <span className="ml-1 text-caption text-text-muted tabular-nums">
              {[
                writer.aiDrafts.length > 0 &&
                  `${writer.aiDrafts.length} draft${writer.aiDrafts.length !== 1 ? "s" : ""}`,
                writer.messages.length > 0 && `${writer.messages.length} message${writer.messages.length !== 1 ? "s" : ""}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <WorkspaceStatusBadge />
        </div>
      ),
    });
    return () => unregisterToolbar("chat");
  }, [registerToolbar, unregisterToolbar, showLogs, writer.aiDrafts.length, writer.messages.length]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showLogs ? (
        <ExecutionLogViewer
          ticketKey={writer.ticketKey}
          isStreaming={writer.status === "streaming" || writer.status === "sending"}
        />
      ) : (
        <StoryWriterChat
          messages={writer.messages}
          status={writer.status}
          streamProgress={writer.streamProgress}
          streamError={writer.streamError}
          usage={writer.usage}
          lastResponseDurationMs={writer.lastResponseDurationMs}
          localDraft={writer.session?.localDraft ?? null}
          codebaseResearch={writer.codebaseResearch}
          onCodebaseResearchChange={writer.onCodebaseResearchChange}
          model={writer.model}
          onModelChange={writer.onModelChange}
          onSend={writer.onSend}
          onRetry={writer.onRetry}
          onDismissFailed={writer.onDismissFailed}
          onClearChat={writer.onClearChat}
          onCancel={(writer.status === "streaming" || writer.status === "sending") ? writer.onCancel : undefined}
          onFindRelated={handleFindRelated}
          onOpenRelatedPanel={handleOpenRelatedPanel}
          onStoryKeyClick={handleStoryKeyClick}
          relatedCandidates={writer.relatedCandidates}
          onLinkCandidate={writer.onLinkCandidate}
          messageDraftMap={messageDraftMap}
          draftContentMap={draftContentMap}
          acceptedDraftIds={acceptedDraftIds}
          onViewDraft={handleViewDraft}
          onFocusDraft={handleFocusDraft}
          onAcceptDraft={handleAcceptDraft}
          onShowDiff={handleShowDiff}
          onOpenLogs={() => setShowLogs(true)}
          onApplyTitle={writer.onTitleChange}
          onApplyType={(type) => writer.onTypeChange(type as IssueType)}
          onCreateLink={writer.onCreateLink}
          linkedIssueKeys={writer.linkedIssueKeys}
          onApplyEpic={writer.onApplyEpic}
          onPostInvestigation={handlePostInvestigation}
          currentEpicKey={writer.currentEpicKey}
          issueType={writer.ticketData?.type ?? "story"}
          currentTitle={writer.session?.localTitle ?? writer.ticketData?.title ?? undefined}
          currentType={writer.ticketData?.type ?? undefined}
          pendingInput={pane.pendingChatInput}
          onPendingInputConsumed={() => pane.consumePendingChatInput()}
        />
      )}
    </div>
  );
}
