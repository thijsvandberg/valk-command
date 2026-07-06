"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { StoryWriterSessionRow, StoryWriterDraftRow } from "@/db/schema";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus, RelatedStoryCandidate } from "@/types/story-writer";
import type { WorkspaceUsage } from "@/hooks/useStoryWriter";
import type { Ticket, TicketDetail, IssueType, Assignee } from "@/types/ticket";

export interface WriterContextValue {
  ticketKey: string;
  ticketData: Ticket | null;
  ticketDetail: (Ticket & TicketDetail) | null;
  mutateTicket: () => void;
  session: StoryWriterSessionRow | null;
  messages: Message[];
  aiDrafts: StoryWriterDraftRow[];
  targetAiDrafts: StoryWriterDraftRow[];
  relatedCandidates: RelatedStoryCandidate[];
  status: StoryWriterStatus;
  streamProgress: string;
  streamError: string | null;
  usage: WorkspaceUsage | null;
  lastResponseDurationMs: number | null;
  codebaseResearch: boolean;
  model: string;
  baseDescription: string;
  targetTicketKey: string | null;
  targetTicketTitle: string | null;
  splitModeVisible: boolean;
  needsTitle: boolean;
  /** The Jira version changed after this draft's baseline (original / target). */
  outdated: boolean;
  targetOutdated: boolean;
  /** Replace the editor content with the current Jira version and clear the outdated warning. */
  onTakeJiraVersion: (slot?: "original" | "target") => Promise<void>;

  onDraftChange: (content: string) => void;
  onTitleChange: (title: string) => void;
  onTargetDraftChange: (content: string) => void;
  onTargetTitleChange: (title: string) => void;
  onSend: (content: string, skill?: string) => Promise<boolean>;
  onRetry: (messageId: string) => Promise<boolean>;
  onDismissFailed: (messageId: string) => Promise<void>;
  onClearChat: () => Promise<void>;
  onCancel: () => Promise<void>;
  onCreateLink: (targetKey: string, relation: string) => Promise<void>;
  linkedIssueKeys: Set<string>;
  onApplyEpic: (epicKey: string) => Promise<void>;
  currentEpicKey: string | null;
  onLinkCandidate: (candidateId: string, isLinked: boolean) => Promise<void>;
  onAcceptDraft: (draftId: string) => Promise<void>;
  onDismissDraft: (draftId: string) => void;
  onTypeChange: (type: IssueType) => Promise<void>;
  onCodebaseResearchChange: (v: boolean) => void;
  onModelChange: (v: string) => void;

  onAssigneeChange: (user: { accountId: string | null; displayName: string; avatarUrl: string | null } | null) => Promise<void>;
  onSprintChange: (sprintId: string | null) => Promise<void>;
  onStoryPointsChange: (v: number | null) => Promise<void>;
  onBusinessValueChange: (v: number | null) => Promise<void>;
  onLabelsChange: (labels: string[]) => Promise<void>;
  onFlagChange: (flagged: boolean) => Promise<void>;
}

const WriterContext = createContext<WriterContextValue | null>(null);

export function useWriterContext(): WriterContextValue {
  const ctx = useContext(WriterContext);
  if (!ctx) throw new Error("useWriterContext must be used inside WriterProvider");
  return ctx;
}

interface WriterProviderProps {
  value: WriterContextValue;
  children: ReactNode;
}

export function WriterProvider({ value, children }: WriterProviderProps) {
  return <WriterContext.Provider value={value}>{children}</WriterContext.Provider>;
}
