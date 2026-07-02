export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  workspaceTaskId: string | null;
  status?: "pending" | "sent" | "failed";
  sequence?: number | null;
  cancelled?: boolean;
  /** Client-only friendly reason for a failed send; not persisted, so reloaded failed messages fall back to generic copy. */
  errorMessage?: string;
}

export type ConversationType = "chat" | "investigation";

export interface SprintGoalMetadata {
  sprintId: string;
  sprintName: string;
  ticketKeys: string[];
}

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  createdAt: string;
  relatedTicket: string | null;
  metadata: string | null;
  pinned: boolean;
  readAt: string | null;
}
