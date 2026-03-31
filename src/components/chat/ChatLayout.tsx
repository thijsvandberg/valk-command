"use client";

import { useState, useCallback } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import ConversationList from "./ConversationList";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

export default function ChatLayout() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      setSidebarOpen(false);
    }
  }, [createConversation]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
  }, []);

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
    <div className="noise-overlay relative flex h-full">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-[-20%] left-[15%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
        <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-50" />
      </div>

      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-elevated)] border border-white/[0.06] lg:hidden cursor-pointer hover:bg-[var(--color-surface-floating)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
        aria-label="Open conversations"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-white/70">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Conversation sidebar */}
      <aside
        data-testid="chat-sidebar"
        className={`fixed top-0 right-0 z-40 h-full w-72 border-l border-white/[0.06] bg-[var(--color-surface-elevated)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] lg:relative lg:z-auto lg:order-first lg:border-l-0 lg:border-r lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-md lg:hidden cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
          aria-label="Close conversations"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4 text-white/50">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <ConversationList
          conversations={conversations}
          activeId={activeId}
          loading={convLoading}
          error={convError}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      </aside>

      {/* Main chat area */}
      <div className="relative z-10 flex flex-1 flex-col min-w-0">
        {activeId ? (
          <>
            <MessageList messages={messages} loading={msgLoading} error={msgError} />
            <MessageInput onSend={sendMessage} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="font-[var(--font-body)] text-sm text-white/30">
              Select a conversation or start a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
