"use client";

import { useMemo } from "react";
import { Loader2, CloudUpload, Save, Check } from "lucide-react";
import Link from "next/link";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { StoryWriterChat } from "@/components/story-writer/StoryWriterChat";
import { ViewHeader, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
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
        actions={
          <>
            <button
              type="button"
              onClick={() => writer.saveDraft()}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-3 text-body-sm font-medium text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
            >
              <Save size={13} strokeWidth={1.5} />
              Save draft
            </button>
            <Button
              variant="primary"
              size="md"
              icon={<CloudUpload size={13} strokeWidth={1.5} />}
              onClick={() => writer.pushToJira()}
            >
              Push to Jira
            </Button>
          </>
        }
      >
        <span className="flex items-center gap-1.5 rounded-md bg-overlay-default px-2.5 py-1 text-label font-medium text-text-tertiary">
          <Check size={11} strokeWidth={2} />
          Epic
        </span>
        <ViewHeaderDivider />
        <Link
          href={`/tickets/${epicKey}`}
          className="font-mono text-[11px] text-text-muted transition-colors duration-150 cursor-pointer hover:text-[var(--color-brand-400)]"
        >
          {epicKey}
        </Link>
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
            onClearFailed={writer.clearFailedMessages}
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
            busy={writer.status === "sending" || writer.status === "streaming"}
          />
        </aside>
      </div>
    </div>
  );
}
