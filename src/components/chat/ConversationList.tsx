"use client";

import type { Conversation, ConversationType } from "@/types/chat";
import { Trash2, Search, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { LoadingState } from "@/components/shared/LoadingState";
import ConversationTypePicker from "./ConversationTypePicker";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: (type: ConversationType) => void;
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
        <ConversationTypePicker onCreate={onCreate} />
      </div>

      {error && (
        <InlineAlert variant="error" className="mx-4 mb-2 text-xs">
          {error}
        </InlineAlert>
      )}

      {loading && conversations.length === 0 ? (
        <LoadingState className="py-8" />
      ) : conversations.length === 0 ? (
        <EmptyState title="No conversations yet" className="px-2 py-8" />
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
                    <span className="flex items-center gap-2 min-w-0">
                      {conversation.type === "investigation" ? (
                        <Search size={13} strokeWidth={1.5} className="shrink-0 text-white/30" />
                      ) : (
                        <MessageCircle size={13} strokeWidth={1.5} className="shrink-0 text-white/30" />
                      )}
                      <span className="block truncate font-[var(--font-body)] text-sm font-medium">
                        {conversation.title}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="destructive"
                    iconOnly
                    icon={<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    onClick={() => onDelete(conversation.id)}
                    className="shrink-0 opacity-0 transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 [li:hover_&]:opacity-100"
                    aria-label={`Delete ${conversation.title}`}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
