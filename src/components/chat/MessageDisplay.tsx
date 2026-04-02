"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/types/chat";

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
      <div className="flex items-center border-b border-white/[0.06] px-6 py-4">
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
                  components={{
                    h1: ({ children }) => (
                      <h1 className="mb-2 mt-4 font-[var(--font-display)] text-base font-semibold tracking-[-0.02em] text-white first:mt-0">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mb-2 mt-4 font-[var(--font-display)] text-sm font-semibold tracking-[-0.01em] text-white/90 first:mt-0">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mb-1.5 mt-3 font-[var(--font-display)] text-sm font-semibold text-white/80 first:mt-0">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 space-y-1 pl-4 last:mb-0">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="relative pl-2 before:absolute before:left-[-0.75rem] before:text-white/30 before:content-['–']">
                        {children}
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-white/95">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic text-white/70">{children}</em>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-xs text-[var(--color-brand-300)]">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="mb-2 overflow-x-auto rounded-lg bg-white/[0.05] p-3 font-mono text-xs last:mb-0">
                        {children}
                      </pre>
                    ),
                    hr: () => (
                      <hr className="my-3 border-white/[0.08]" />
                    ),
                  }}
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
