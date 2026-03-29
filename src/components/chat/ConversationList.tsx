"use client";

import type { Conversation } from "@/types/chat";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export default function ConversationList({
  conversations,
  activeId,
  loading,
  error,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col border-r border-white/[0.06] bg-[var(--color-surface-elevated)]" data-testid="conversation-list">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="font-[var(--font-display)] text-sm font-semibold tracking-wide text-white/70">
          Conversations
        </h2>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-brand-600)] text-white shadow-[0_2px_8px_rgba(46,145,73,0.2)] cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95 transition-transform duration-150"
          aria-label="New conversation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400" role="alert">
          {error}
        </div>
      )}

      {loading && conversations.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8" role="status">
          <span className="text-sm text-white/30">Loading...</span>
        </div>
      ) : conversations.length === 0 ? (
        <div className="px-2 py-8 text-center text-sm text-white/30">
          No conversations yet
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label="Conversation list">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId;
            return (
              <li key={conversation.id} role="option" aria-selected={isActive}>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`flex-1 min-w-0 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                      isActive
                        ? "bg-[var(--color-brand-600)]/12 text-white"
                        : "text-white/60 hover:bg-white/[0.04] hover:text-white/80 active:bg-white/[0.06]"
                    }`}
                  >
                    <span className="block truncate font-[var(--font-body)] text-sm font-medium">
                      {conversation.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(conversation.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 cursor-pointer hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] [li:hover_&]:opacity-100"
                    aria-label={`Delete ${conversation.title}`}
                  >
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-white/40">
                      <path
                        fillRule="evenodd"
                        d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 1 .7.797l-.35 5.5a.75.75 0 0 1-1.497-.094l.35-5.5a.75.75 0 0 1 .797-.703Zm2.84 0a.75.75 0 0 1 .796.703l.35 5.5a.75.75 0 1 1-1.496.095l-.35-5.5a.75.75 0 0 1 .7-.798Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
