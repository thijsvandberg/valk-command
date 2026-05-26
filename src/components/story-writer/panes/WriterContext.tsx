"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { StoryWriterSessionRow, StoryWriterDraftRow, RelatedStoryCandidateRow } from "@/db/schema";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";
import type { WorkspaceUsage } from "@/hooks/useStoryWriter";
import type { Ticket, IssueType } from "@/types/ticket";

export interface WriterContextValue {
  ticketKey: string;
  ticketData: Ticket | null;
  session: StoryWriterSessionRow | null;
  messages: Message[];
  aiDrafts: StoryWriterDraftRow[];
  targetAiDrafts: StoryWriterDraftRow[];
  relatedCandidates: RelatedStoryCandidateRow[];
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

  onDraftChange: (content: string) => void;
  onTitleChange: (title: string) => void;
  onTargetDraftChange: (content: string) => void;
  onTargetTitleChange: (title: string) => void;
  onSend: (content: string, skill?: string) => Promise<boolean>;
  onRetry: (messageId: string) => Promise<boolean>;
  onClearFailed: () => Promise<void>;
  onCreateLink: (targetKey: string, relation: string) => Promise<void>;
  linkedIssueKeys: Set<string>;
  onLinkCandidate: (candidateId: string, isLinked: boolean) => Promise<void>;
  onAcceptDraft: (draftId: string) => Promise<void>;
  onDismissDraft: (draftId: string) => void;
  onTypeChange: (type: IssueType) => Promise<void>;
  onCodebaseResearchChange: (v: boolean) => void;
  onModelChange: (v: string) => void;
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
