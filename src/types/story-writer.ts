import type { StoryWriterSessionRow, StoryWriterDraftRow, Message } from "@/db/schema";

export type StoryWriterStatus = "idle" | "loading" | "ready" | "sending" | "streaming";

export type StoryWriterSessionStatus = "active" | "completed" | "discarded";

export type DraftAction = "accept" | "merge" | "dismiss";

export interface StoryWriterSessionWithMessages {
  session: StoryWriterSessionRow;
  messages: Message[];
  aiDrafts: StoryWriterDraftRow[];
}

export interface StoryWriterMessageResponse {
  messageId: string;
  taskId: string;
  streamUrl: string;
  isFirstMessage: boolean;
}

export interface ApplyDraftResponse {
  draftId: string | null;
  draftIndex: number | null;
  hasDraft: boolean;
}

export interface ActiveSessionsMap {
  [ticketKey: string]: string;
}
