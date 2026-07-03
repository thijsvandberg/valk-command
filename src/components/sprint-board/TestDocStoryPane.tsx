"use client";

import { Loader2 } from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { stripTestDocBlock } from "@/lib/test-doc";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import type { Ticket, TicketDetail } from "@/types/ticket";

/**
 * The right half of the test-doc review modal (BRDG-426): the story in the
 * ticket-sidebar's reading style, followed by its Jira comments — the PO
 * validates the doc with the full story context actually visible.
 */
export function TestDocStoryPane({ detail }: { detail: (Ticket & TicketDetail) | undefined }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="test-doc-story-pane">
      {detail ? (
        <>
          <h3 className="mb-3 text-h4 font-semibold text-text-primary">{detail.title}</h3>
          <div className="description-content text-body-lg leading-prose text-text-secondary">
            {detail.description?.trim()
              ? // The doc under review IS the expand block; repeating it
                // inside the story rendering is pure noise.
                renderMarkdown(stripTestDocBlock(detail.description), { linkifyRefs: true })
              : <p className="text-body-lg text-text-muted">No description.</p>}
          </div>
          {detail.jiraComments && detail.jiraComments.length > 0 && (
            <div className="mt-6 border-t border-border-subtle pt-4" data-testid="test-doc-story-comments">
              <p className="mb-3 text-caption font-medium uppercase tracking-wide text-text-tertiary">
                Comments ({detail.jiraComments.length})
              </p>
              {/* Mirrors the ticket sidebar's comment styling (CommentsSection). */}
              <div className="flex flex-col gap-4">
                {detail.jiraComments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold text-white"
                      style={{ backgroundColor: c.authorColor }}
                    >
                      {c.authorInitials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-body-sm font-medium text-text-secondary">{c.authorName}</span>
                        <span className="text-caption text-text-muted" title={formatAbsoluteDate(c.createdAt)}>
                          {relativeDate(c.createdAt)}
                        </span>
                      </div>
                      <div className="description-content mt-1 text-body-lg leading-prose text-text-secondary">
                        {renderMarkdown(c.content, { linkifyRefs: true })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-text-muted">
          <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
        </div>
      )}
    </div>
  );
}
