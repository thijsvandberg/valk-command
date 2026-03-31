export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  workspaceTaskId: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  relatedTicket: string | null;
}
