import { Star, Search, Mail, FileText } from "lucide-react";
import type { QuickAction } from "@/components/shared/chat-controls";

/**
 * General-purpose quick actions for the standalone chat. Each fills the input
 * with a starter prompt (the user completes it) rather than sending immediately,
 * since these are open-ended unlike the Story Writer's story-scoped actions.
 */
export const CHAT_QUICK_ACTIONS: QuickAction[] = [
  { id: "review", label: "Review a ticket", icon: Star, prompt: "/review-story ", enabled: true },
  { id: "investigate", label: "Investigate code", icon: Search, prompt: "/investigate ", enabled: true },
  { id: "draft-email", label: "Draft an email", icon: Mail, prompt: "Draft an email about ", enabled: true },
  { id: "summarize", label: "Summarize a ticket", icon: FileText, prompt: "Summarize ticket ", enabled: true },
];
