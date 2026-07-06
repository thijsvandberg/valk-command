"use client";

import { useMemo } from "react";
import type { useStoryWriter } from "@/hooks/useStoryWriter";
import type { WriterContextValue } from "@/components/story-writer/panes/WriterContext";

type Writer = ReturnType<typeof useStoryWriter>;

const NOOP_ASYNC = async () => {};

/**
 * Adapts the epic-mode useStoryWriter into a WriterContextValue so the Epic
 * Writer can mount real Story Writer pane apps (BRDG-484) - notably
 * StoryPreviewApp for the saved epic draft - instead of a bespoke lookalike
 * panel. Only the fields those content apps read are wired to live values; the
 * ticket-detail handlers the epic flow does not expose (assignee/sprint/points/
 * labels/type/epic) are safe async no-ops, since the epic content apps never
 * call them.
 */
export function useEpicWriterContext(writer: Writer, epicKey: string): WriterContextValue {
  return useMemo<WriterContextValue>(
    () => ({
      ticketKey: epicKey,
      ticketData: null,
      ticketDetail: null,
      mutateTicket: () => {},
      session: writer.session,
      messages: writer.messages,
      aiDrafts: writer.aiDrafts,
      targetAiDrafts: writer.targetAiDrafts,
      relatedCandidates: writer.relatedCandidates,
      status: writer.status,
      streamProgress: writer.streamProgress,
      streamError: writer.streamError,
      usage: writer.usage,
      lastResponseDurationMs: writer.lastResponseDurationMs,
      codebaseResearch: writer.codebaseResearch,
      model: writer.model,
      baseDescription: writer.session?.localDraft ?? "",
      targetTicketKey: null,
      targetTicketTitle: null,
      splitModeVisible: false,
      needsTitle: false,
      outdated: writer.outdated,
      targetOutdated: writer.targetOutdated,
      onTakeJiraVersion: NOOP_ASYNC,
      onDraftChange: writer.updateLocalDraft,
      onTitleChange: writer.updateLocalTitle,
      onTargetDraftChange: writer.updateTargetLocalDraft,
      onTargetTitleChange: writer.updateTargetLocalTitle,
      onSend: writer.sendMessage,
      onRetry: writer.retryMessage,
      onDismissFailed: writer.dismissFailedMessage,
      onCancel: writer.cancelCurrentTask,
      onCreateLink: writer.createLink,
      linkedIssueKeys: new Set<string>(),
      onApplyEpic: NOOP_ASYNC,
      currentEpicKey: null,
      onLinkCandidate: writer.linkCandidate,
      onAcceptDraft: writer.acceptDraft,
      onDismissDraft: writer.dismissDraft,
      onTypeChange: NOOP_ASYNC,
      onCodebaseResearchChange: writer.setCodbaseResearch,
      onModelChange: writer.setModel,
      onAssigneeChange: NOOP_ASYNC,
      onSprintChange: NOOP_ASYNC,
      onStoryPointsChange: NOOP_ASYNC,
      onBusinessValueChange: NOOP_ASYNC,
      onLabelsChange: NOOP_ASYNC,
      onFlagChange: NOOP_ASYNC,
    }),
    [writer, epicKey],
  );
}
