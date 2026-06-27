"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useMessages } from "@/hooks/useMessages";
import { Loader2, ChevronDown, ChevronRight, Sparkles, CheckCircle2, AlertCircle, SkipForward, Info } from "lucide-react";
import Link from "next/link";
import type { Message } from "@/types/chat";

interface BulkSuggestPanelProps {
  conversationId: string;
  isRunning: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

type LogEntryType = "generated" | "skipped" | "failed" | "summary";

interface LogEntry {
  id: string;
  type: LogEntryType;
  ticketKey: string | null;
  ticketTitle: string | null;
  count: number | null;
  raw: string;
}

function parseLogEntry(msg: Message): LogEntry | null {
  if (msg.role !== "assistant") return null;
  const c = msg.content;

  // "Generated 5 suggestions for [VPL-123](/tickets/VPL-123) Some title"
  const genMatch = c.match(/^Generated (\d+) suggestions? for \[([^\]]+)\]\([^)]+\)\s*(.*)$/);
  if (genMatch) {
    return {
      id: msg.id,
      type: "generated",
      ticketKey: genMatch[2],
      ticketTitle: genMatch[3] || null,
      count: parseInt(genMatch[1], 10),
      raw: c,
    };
  }

  // "Skipped [VPL-123](/tickets/VPL-123) Some title - reason"
  const skipMatch = c.match(/^Skipped \[([^\]]+)\]\([^)]+\)\s*(.*)$/);
  if (skipMatch) {
    const rest = skipMatch[2];
    const titlePart = rest.replace(/\s*-\s*suggestions are up to date\.?$/, "");
    return {
      id: msg.id,
      type: "skipped",
      ticketKey: skipMatch[1],
      ticketTitle: titlePart || null,
      count: null,
      raw: c,
    };
  }

  // "Failed: [VPL-123](/tickets/VPL-123) title - reason"
  const failMatch = c.match(/^Failed:?\s*\[([^\]]+)\]\([^)]+\)\s*(.*)$/);
  if (failMatch) {
    return {
      id: msg.id,
      type: "failed",
      ticketKey: failMatch[1],
      ticketTitle: failMatch[2]?.split(" - ")[0] || null,
      count: null,
      raw: c,
    };
  }

  // "Bulk suggestion complete..."
  if (c.startsWith("Bulk suggestion complete")) {
    return { id: msg.id, type: "summary", ticketKey: null, ticketTitle: null, count: null, raw: c };
  }

  return null;
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const href = entry.ticketKey ? `/tickets/${entry.ticketKey}` : null;

  if (entry.type === "summary") {
    return null;
  }

  const icon = entry.type === "generated"
    ? <CheckCircle2 size={12} strokeWidth={2} className="shrink-0 text-emerald-400" />
    : entry.type === "skipped"
      ? <SkipForward size={12} strokeWidth={2} className="shrink-0 text-text-muted" />
      : <AlertCircle size={12} strokeWidth={2} className="shrink-0 text-red-400" />;

  const badge = entry.type === "generated" && entry.count != null
    ? <span className="shrink-0 text-caption tabular-nums text-emerald-400">{entry.count} subtask{entry.count !== 1 ? "s" : ""}</span>
    : entry.type === "skipped"
      ? <span className="shrink-0 text-caption text-text-muted">up to date</span>
      : null;

  return (
    <div className="flex items-center gap-2 py-1.5">
      {icon}
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-body-sm font-medium text-[var(--color-brand-500)] hover:text-[var(--color-brand-400)] hover:underline"
          style={{ transition: "color 0.15s ease" }}
        >
          {entry.ticketKey}
        </Link>
      ) : (
        <span className="shrink-0 text-body-sm font-medium text-text-secondary">{entry.ticketKey}</span>
      )}
      {entry.ticketTitle && (
        <span className="min-w-0 flex-1 truncate text-body-sm text-text-muted">{entry.ticketTitle}</span>
      )}
      {badge}
    </div>
  );
}

export function BulkSuggestPanel({
  conversationId,
  isRunning,
  collapsed,
  onToggleCollapse,
}: BulkSuggestPanelProps) {
  const { messages } = useMessages(conversationId, { hasRunningTask: isRunning });

  const entries = useMemo(() => {
    return messages
      .map(parseLogEntry)
      .filter((e): e is LogEntry => e !== null);
  }, [messages]);

  const resultEntries = entries.filter((e) => e.type !== "summary");
  const summaryEntry = entries.find((e) => e.type === "summary");
  const isComplete = !!summaryEntry;
  const generatedCount = resultEntries.filter((e) => e.type === "generated").length;
  const totalCount = resultEntries.length;

  // Treat as still running if no completion summary arrived yet
  const effectiveRunning = isRunning || (!isComplete && resultEntries.length > 0);

  // Auto-scroll
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  useEffect(() => {
    if (resultEntries.length > prevCountRef.current && wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = resultEntries.length;
  }, [resultEntries.length]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-elevated)]">
      {/* Header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease" }}
      >
        {collapsed ? (
          <ChevronRight size={12} strokeWidth={2} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown size={12} strokeWidth={2} className="shrink-0 text-text-muted" />
        )}

        {effectiveRunning ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-[var(--color-brand-400)]" />
        ) : (
          <Sparkles size={12} strokeWidth={2} className="shrink-0 text-text-muted" />
        )}

        <span className="text-body-sm font-medium text-text-secondary">
          {effectiveRunning
            ? `Generating subtasks (${generatedCount}/${totalCount || "..."})`
            : "Subtask suggestions"}
        </span>

        {isComplete && !effectiveRunning && (
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-caption font-medium text-emerald-400">
            Done
          </span>
        )}

        {totalCount > 0 && (
          <span className="ml-auto text-caption tabular-nums text-text-muted">
            {generatedCount} of {totalCount}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      {!collapsed && (
        <div className="border-t border-border-subtle">
          {/* Background info */}
          {effectiveRunning && (
            <div className="flex items-start gap-2 border-b border-border-subtle bg-[var(--color-brand-500)]/[0.03] px-3 py-2">
              <Info size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-text-muted" />
              <p className="text-label leading-relaxed text-text-muted">
                This runs in the background. You can close this page and come back later.
              </p>
            </div>
          )}

          {/* Message list */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="max-h-[200px] overflow-y-auto px-3 py-1.5"
            style={{ scrollbarWidth: "thin" }}
          >
            {resultEntries.length === 0 && effectiveRunning && (
              <div className="flex items-center gap-2 py-3">
                <Loader2 size={12} className="animate-spin text-[var(--color-brand-400)]" />
                <span className="text-body-sm text-text-muted">Starting...</span>
              </div>
            )}

            {resultEntries.map((entry) => (
              <LogEntryRow key={entry.id} entry={entry} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Summary */}
          {isComplete && summaryEntry && (
            <div className="border-t border-border-subtle px-3 py-2">
              <p className="text-label text-text-muted">
                {summaryEntry.raw.replace("Bulk suggestion complete. ", "")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
