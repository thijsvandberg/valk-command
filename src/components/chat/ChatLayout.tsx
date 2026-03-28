"use client";

import { useState, useCallback } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import ConversationList from "./ConversationList";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

export default function ChatLayout() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const {
    conversations,
    loading: convLoading,
    error: convError,
    createConversation,
    deleteConversation,
  } = useConversations();

  const {
    messages,
    loading: msgLoading,
    error: msgError,
    sendMessage,
  } = useMessages(activeId);

  const handleCreate = useCallback(async () => {
    const conversation = await createConversation();
    if (conversation) {
      setActiveId(conversation.id);
    }
  }, [createConversation]);

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteConversation(id);
      if (success && activeId === id) {
        setActiveId(null);
      }
    },
    [deleteConversation, activeId]
  );

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <div className="hidden w-72 shrink-0 lg:block">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          loading={convLoading}
          error={convError}
          onSelect={setActiveId}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {activeId ? (
          <>
            <MessageList messages={messages} loading={msgLoading} error={msgError} />
            <MessageInput onSend={sendMessage} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <p className="font-[var(--font-body)] text-sm text-white/30">
              Select a conversation or start a new one.
            </p>

            {/* Mobile: show conversation list inline when no conversation is active */}
            <div className="w-full max-w-sm lg:hidden">
              <ConversationList
                conversations={conversations}
                activeId={activeId}
                loading={convLoading}
                error={convError}
                onSelect={setActiveId}
                onCreate={handleCreate}
                onDelete={handleDelete}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
