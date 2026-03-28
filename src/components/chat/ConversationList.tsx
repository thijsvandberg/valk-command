"use client";

import type { Conversation } from "@/data/chat-mock";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNewConversation,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col" data-testid="conversation-list">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="font-[var(--font-display)] text-sm font-semibold tracking-wide text-white/70">
          Conversations
        </h2>
        <button
          type="button"
          onClick={onNewConversation}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-brand-600)] text-white shadow-[0_2px_8px_rgba(46,145,73,0.2)] cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-transform duration-150"
          aria-label="New conversation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto px-2" role="listbox" aria-label="Conversation list">
        {conversations.map((conv) => {
          const active = conv.id === activeId;
          return (
            <li key={conv.id} role="option" aria-selected={active}>
              <button
                type="button"
                onClick={() => onSelect(conv.id)}
                className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  active
                    ? "bg-[var(--color-brand-600)]/12 text-white"
                    : "text-white/60 hover:bg-white/[0.04] hover:text-white/80 active:bg-white/[0.06]"
                }`}
              >
                <span className="block truncate font-[var(--font-body)] text-sm font-medium">
                  {conv.title}
                </span>
                <span className={`mt-0.5 block text-xs ${active ? "text-[var(--color-brand-300)]" : "text-white/30"}`}>
                  {formatDate(conv.lastMessageAt)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
