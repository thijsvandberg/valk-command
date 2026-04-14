export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  workspaceTaskId: string | null;
  status?: "pending" | "sent" | "failed";
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  relatedTicket: string | null;
}
