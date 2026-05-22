"use client";

import type { Conversation, ConversationType } from "@/types/chat";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { LoadingState } from "@/components/shared/LoadingState";
import ConversationTypePicker from "./ConversationTypePicker";
import ConversationFilterBar from "./ConversationFilterBar";
import { deriveCategory, CATEGORY_CONFIG, type ConversationCategory } from "@/lib/conversation-category";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  runningTaskConversationIds?: Set<string>;
  categoryCounts?: Record<ConversationCategory, number>;
  activeFilters?: Set<ConversationCategory>;
  onToggleFilter?: (category: ConversationCategory) => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  onSelect: (id: string) => void;
  onCreate: (type: ConversationType) => void;
  onDelete: (id: string) => void;
}

export default function ConversationList({
  conversations,
  activeId,
  loading,
  error,
  runningTaskConversationIds,
  categoryCounts,
  activeFilters,
  onToggleFilter,
  onClearFilters,
  hasActiveFilters,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  const showFilterBar = categoryCounts && activeFilters && onToggleFilter && onClearFilters;

  return (
    <div className="flex h-full flex-col border-r border-border-default bg-[var(--color-surface-elevated)]" data-testid="conversation-list">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="font-[var(--font-display)] text-sm font-semibold tracking-wide text-text-secondary">
          Conversations
        </h2>
        <ConversationTypePicker onCreate={onCreate} />
      </div>

      {showFilterBar && (
        <ConversationFilterBar
          categoryCounts={categoryCounts}
          activeFilters={activeFilters}
          onToggle={onToggleFilter}
          onClearAll={onClearFilters}
        />
      )}

      {error && (
        <InlineAlert variant="error" className="mx-4 mb-2 text-xs">
          {error}
        </InlineAlert>
      )}

      {loading && conversations.length === 0 ? (
        <LoadingState className="py-8" />
      ) : conversations.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching conversations" : "No conversations yet"}
          className="px-2 py-8"
        />
      ) : (
        <ul className="flex-1 overflow-y-auto px-2 pb-2" role="listbox" aria-label="Conversation list">
          {conversations.map((conversation) => {
            const isActive = conversation.id === activeId;
            const hasRunningTask = runningTaskConversationIds?.has(conversation.id) ?? false;
            const category = deriveCategory(conversation);
            const config = CATEGORY_CONFIG[category];
            const Icon = config.icon;

            return (
              <li key={conversation.id} role="option" aria-selected={isActive}>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`flex-1 min-w-0 rounded-lg py-2.5 pr-3 pl-0 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                      isActive
                        ? "bg-[var(--color-brand-600)]/12 text-text-primary"
                        : "text-text-secondary hover:bg-hover-list-item hover:text-text-primary active:bg-overlay-default"
                    }`}
                    style={{
                      borderLeft: `2px solid ${config.color}`,
                      paddingLeft: "10px",
                    }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon
                        size={13}
                        strokeWidth={1.5}
                        className="shrink-0"
                        style={{ color: config.color }}
                      />
                      <span className="block truncate font-[var(--font-body)] text-sm font-medium">
                        {conversation.title}
                      </span>
                      {hasRunningTask && (
                        <span
                          className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)] animate-pulse"
                          aria-label="Task running"
                        />
                      )}
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
