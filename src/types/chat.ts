export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  workspaceTaskId: string | null;
  status?: "pending" | "sent" | "failed";
  sequence?: number | null;
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
