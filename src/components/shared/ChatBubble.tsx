"use client";

import type { ReactNode } from "react";
import { formatTimestamp } from "@/lib/format-timestamp";

interface ChatBubbleProps {
  role: "user" | "assistant";
  children: ReactNode;
  /** ISO timestamp string */
  timestamp?: string;
  /** Show timestamp always (on last message) or only on hover */
  showTimestamp?: "always" | "hover";
  /** Dim the bubble (optimistic/sending state) */
  dimmed?: boolean;
  /** Actions rendered inside the bubble (e.g. CopyActions) */
  actions?: ReactNode;
  /** data-testid for the bubble container */
  testId?: string;
  /** Additional class names on the bubble div */
  className?: string;
}

export function ChatBubble({
  role,
  children,
  timestamp,
  showTimestamp = "hover",
  dimmed,
  actions,
  testId,
  className,
}: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={`group/msg flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[80%] overflow-x-auto rounded-2xl px-4 py-3 text-sm leading-[1.7] font-[var(--font-body)] shadow-sm ${
          isUser
            ? "rounded-br-lg bg-[var(--color-brand-600)] text-white shadow-[0_2px_8px_rgba(46,145,73,0.18)]"
            : "rounded-bl-lg bg-[var(--color-surface-floating)] text-text-primary border border-border-default"
        } ${dimmed ? "opacity-60" : ""} ${className ?? ""}`}
        data-testid={testId ?? `message-${role}`}
      >
        {children}
        {actions}
      </div>
      {timestamp && (
        <span
          className={`mt-1 text-[10px] text-text-muted tabular-nums select-none transition-opacity duration-150 ${
            showTimestamp === "always"
              ? "opacity-100"
              : "opacity-0 group-hover/msg:opacity-100"
          }`}
        >
          {formatTimestamp(timestamp)}
        </span>
      )}
    </div>
  );
}
