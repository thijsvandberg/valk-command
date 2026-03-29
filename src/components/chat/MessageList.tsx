"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/chat";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
  error: string | null;
}

export default function MessageList({ messages, loading, error }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        <span className="text-sm text-white/30">Loading messages...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-white/30">Send a message to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-[1.7] font-[var(--font-body)] ${
                message.role === "user"
                  ? "bg-[var(--color-brand-600)] text-white shadow-[0_2px_8px_rgba(46,145,73,0.18)]"
                  : "bg-[var(--color-surface-floating)] text-white/80 border border-white/[0.06]"
              }`}
              data-testid={`message-${message.role}`}
            >
              {message.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
