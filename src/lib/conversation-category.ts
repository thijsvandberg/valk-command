import {
  MessageCircle,
  MessageSquareText,
  Search,
  PenLine,
  Target,
  Users,
  ClipboardCheck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Conversation } from "@/types/chat";

export type ConversationCategory =
  | "chat"
  | "task"
  | "investigation"
  | "story-writer"
  | "sprint-goal"
  | "stakeholder"
  | "review"
  | "ticket-chat";

export interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  color: string;
}

export const CATEGORY_CONFIG: Record<ConversationCategory, CategoryConfig> = {
  chat: {
    label: "Chat",
    icon: MessageCircle,
    color: "var(--color-brand-400)",
  },
  task: {
    label: "Task",
    icon: Zap,
    color: "var(--color-warning-400)",
  },
  investigation: {
    label: "Investigation",
    icon: Search,
    color: "#60a5fa",
  },
  "story-writer": {
    label: "Story Writer",
    icon: PenLine,
    color: "var(--color-testing-400)",
  },
  "sprint-goal": {
    label: "Sprint Goal",
    icon: Target,
    color: "var(--color-secondary-400)",
  },
  stakeholder: {
    label: "Stakeholder",
    icon: Users,
    color: "#f472b6",
  },
  review: {
    label: "Review",
    icon: ClipboardCheck,
    color: "#fb923c",
  },
  "ticket-chat": {
    label: "Ticket Chat",
    icon: MessageSquareText,
    color: "#a78bfa",
  },
};

const PREFIX_MAP: [string, ConversationCategory][] = [
  ["Sprint Goal:", "sprint-goal"],
  ["Story Writer:", "story-writer"],
  ["Ticket Chat:", "ticket-chat"],
  ["Stakeholder:", "stakeholder"],
  ["Review:", "review"],
  ["Investigate:", "investigation"],
  ["Task:", "task"],
];

export function deriveCategory(conv: Conversation): ConversationCategory {
  if (conv.type === "investigation") return "investigation";

  const title = conv.title;
  for (const [prefix, category] of PREFIX_MAP) {
    if (title.startsWith(prefix)) return category;
  }

  // Generic "New conversation" or user-created chats
  return "chat";
}

export const ALL_CATEGORIES: ConversationCategory[] = Object.keys(CATEGORY_CONFIG) as ConversationCategory[];
