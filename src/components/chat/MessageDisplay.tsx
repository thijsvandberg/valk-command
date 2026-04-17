"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/types/chat";
import { markdownComponents } from "./markdown-components";

interface MessageDisplayProps {
  messages: Message[];
  conversationTitle: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageDisplay({ messages, conversationTitle }: MessageDisplayProps) {
  return (
    <div className="flex h-full flex-col" data-testid="message-display">
      {/* Conversation header */}
      <div className="flex items-center border-b border-border-default px-6 py-4">
        <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white">
          {conversationTitle}
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6" role="log" aria-label="Chat messages">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-white/40">
                  {msg.role === "user" ? "You" : "Assistant"}
                </span>
                <span className="text-xs text-white/20">{formatTime(msg.timestamp)}</span>
              </div>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 font-[var(--font-body)] text-sm leading-[1.7] ${
                  msg.role === "user"
                    ? "bg-[var(--color-brand-600)]/20 text-white/90 shadow-[0_2px_12px_rgba(46,145,73,0.1)]"
                    : "bg-[var(--color-surface-floating)] text-white/80 shadow-[0_2px_12px_rgba(0,0,0,0.15)]"
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
