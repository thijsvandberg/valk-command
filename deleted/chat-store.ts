import type { Conversation, Message } from "@/types/chat";

let conversations: Conversation[] = [];
let messages: Message[] = [];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getConversations(): Conversation[] {
  return [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getConversation(id: string): Conversation | undefined {
  return conversations.find((c) => c.id === id);
}

export function createConversation(title?: string): Conversation {
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: generateId(),
    title: title || "New conversation",
    createdAt: now,
    updatedAt: now,
  };
  conversations.push(conversation);
  return conversation;
}

export function deleteConversation(id: string): boolean {
  const index = conversations.findIndex((c) => c.id === id);
  if (index === -1) return false;
  conversations.splice(index, 1);
  messages = messages.filter((m) => m.conversationId !== id);
  return true;
}

export function getMessages(conversationId: string): Message[] {
  return messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Message {
  const message: Message = {
    id: generateId(),
    conversationId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);

  const conversation = conversations.find((c) => c.id === conversationId);
  if (conversation) {
    conversation.updatedAt = message.createdAt;
  }

  return message;
}

export function resetStore(): void {
  conversations = [];
  messages = [];
}
