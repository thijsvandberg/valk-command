"use client";

interface StreamingIndicatorProps {
  /** Progress text shown next to the pulsing dot. */
  text: string;
  /** Extra classes on the root (e.g. "flex-1" or left padding for alignment). */
  className?: string;
}

/**
 * Pulsing-dot streaming indicator shared across the chat surfaces (standalone
 * chat, Story Writer, ticket chat) so live progress looks identical everywhere.
 */
export function StreamingIndicator({ text, className }: StreamingIndicatorProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`} data-testid="streaming-indicator">
      <span className="relative flex size-2 items-center justify-center">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-brand-400)] opacity-40" />
        <span className="relative inline-flex size-1.5 rounded-full bg-[var(--color-brand-400)]" />
      </span>
      <span className="text-body-sm text-text-secondary truncate">{text}</span>
    </div>
  );
}
