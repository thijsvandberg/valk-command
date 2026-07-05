"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Bookmark, StickyNote, ArrowUpRight } from "lucide-react";
import { tickets, swrFetcher } from "@/lib/api-client";
import type { BookmarkEntry } from "@/lib/bookmarks";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Tooltip } from "@/components/shared/Tooltip";
import { ViewHeader } from "@/components/shared/ViewHeader";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import {
  registerPendingEdit,
  confirmPendingEdit,
  clearPendingEdit,
} from "@/components/sprint-board/pendingTicketEdits";

// Full cross-sprint overview of every bookmarked ticket (BRDG-355), most-recently
// bookmarked first. A dedicated board page rather than the SprintBoard component,
// which is bound to /sprint-board URL routing and slot state. It reuses the same
// batch endpoint as the launcher quick-list and the shared TicketStatusPill so the
// rows read like the board.
export default function BookmarksPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<BookmarkEntry[]>(
    tickets.bookmarksUrl(),
    swrFetcher,
    { revalidateOnFocus: false },
  );
  const entries = data ?? [];

  const removeBookmark = useCallback(async (key: string) => {
    // Optimistically drop the row; the board overlay carries the un-bookmark to any
    // mounted board row so its badge clears too.
    registerPendingEdit(key, "bookmarked", false, Date.now());
    void mutate((cur) => (cur ?? []).filter((b) => b.key !== key), { revalidate: false });
    try {
      await tickets.setBookmarked(key, false);
      confirmPendingEdit(key, "bookmarked");
    } catch {
      clearPendingEdit(key, "bookmarked");
      void mutate();
    }
  }, [mutate]);

  return (
    <div className="flex h-full flex-col">
      <ViewHeader icon={<Bookmark size={18} strokeWidth={1.5} className="text-[var(--meta-bv-fg)]" />}>
        <div className="flex items-baseline gap-2">
          <h1 className="text-body-lg font-semibold text-text-primary">Bookmarks</h1>
          {entries.length > 0 && (
            <span className="font-mono text-caption uppercase tracking-label text-text-muted">
              {entries.length} story{entries.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </ViewHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-4xl">
          {error ? (
            <DataErrorState error={error} variant="full" onRetry={() => void mutate()} />
          ) : isLoading && entries.length === 0 ? (
            <LoadingState variant="spinner" label="Loading bookmarks..." />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<Bookmark size={20} strokeWidth={1.5} className="text-[var(--meta-bv-fg)]" />}
              title="No bookmarks yet"
              description="Bookmark a story from its page, a board row, the right-click menu or the editor to keep it here for quick reference across sprints."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
              {entries.map((entry, i) => (
                <div
                  key={entry.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/tickets/${entry.key}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/tickets/${entry.key}`);
                    }
                  }}
                  className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${i > 0 ? "border-t border-border-subtle" : ""}`}
                >
                  <span className="relative flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                    <TicketStatusPill
                      ticketKey={entry.key}
                      jiraStatus={entry.jiraStatus}
                      issueType={entry.type}
                      title={entry.title}
                      variant="list"
                      size="sm"
                      showReadiness={false}
                      showHoverCard={false}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary transition-colors group-hover:text-text-primary">
                    {entry.title}
                  </span>
                  {entry.notes.trim() && (
                    <Tooltip content={entry.notes} className="shrink-0">
                      <StickyNote className="h-3.5 w-3.5 text-[var(--meta-bv-fg)]" strokeWidth={1.5} aria-label="PO note" />
                    </Tooltip>
                  )}
                  <span className="hidden shrink-0 max-w-[140px] truncate font-mono text-caption uppercase tracking-label text-text-muted/70 sm:inline">
                    {entry.sprintName ?? "Backlog"}
                  </span>
                  <Tooltip content="Remove bookmark" className="shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void removeBookmark(entry.key); }}
                      aria-label={`Remove bookmark from ${entry.key}`}
                      className="grid h-7 w-7 place-items-center rounded-md text-[var(--meta-bv-fg)] cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--meta-bv-fg)_14%,transparent)] active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <Bookmark size={14} strokeWidth={1.75} fill="currentColor" />
                    </button>
                  </Tooltip>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
