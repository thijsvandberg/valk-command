"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { ChevronLeft, ChevronRight, Bookmark, StickyNote, ArrowRight } from "lucide-react";
import { tickets, swrFetcher } from "@/lib/api-client";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { Tooltip } from "@/components/shared/Tooltip";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { revealStyle } from "@/components/nav/revealStyle";
import type { BookmarkEntry } from "@/lib/bookmarks";

// A bookmark's PO note reuses poNotes, which can run to 5000 chars. The launcher hover
// only teases WHY it was saved (the full note lives on the ticket), so clamp it to a
// short snippet — otherwise a long note makes an oversized tooltip (BRDG-481).
const NOTE_SNIPPET_MAX = 180;
function noteSnippet(note: string): string {
  const trimmed = note.trim();
  return trimmed.length > NOTE_SNIPPET_MAX ? `${trimmed.slice(0, NOTE_SNIPPET_MAX).trimEnd()}…` : trimmed;
}

/**
 * One bookmark row: the loose pill segments (issue type, key, status — the same
 * `variant="list"` anatomy as Recently viewed) then the title, an optional PO-note
 * reveal, the sprint (or Backlog) and a chevron. Unlike Recently viewed, every field
 * comes from the single `/api/bookmarks` payload, so the row paints fully-formed with
 * NO per-row fetch — the perceived-speed fix in BRDG-355.
 */
function BookmarkRow({
  entry,
  index,
  open,
  isCurrent,
  onOpen,
}: {
  entry: BookmarkEntry;
  index: number;
  open: boolean;
  isCurrent: boolean;
  onOpen: (key: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry.key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(entry.key);
        }
      }}
      style={revealStyle(open, 2 + index)}
      className="group flex w-full items-center gap-2 border-t border-border-subtle py-2 pl-1 pr-0.5 text-left transition-colors duration-150 cursor-pointer first:border-t-0 hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
        <Tooltip content={noteSnippet(entry.notes)} className="shrink-0">
          <StickyNote className="h-3.5 w-3.5 text-[var(--meta-bv-fg)]" strokeWidth={1.5} aria-label="PO note" />
        </Tooltip>
      )}
      <span className="shrink-0 max-w-[92px] truncate font-mono text-caption uppercase tracking-label text-text-muted/70">
        {entry.sprintName ?? "Backlog"}
      </span>
      {isCurrent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-400)]" aria-label="Currently open" />}
      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={1.5} />
    </div>
  );
}

export function BookmarksView({
  open,
  onBack,
  onClose,
}: {
  open: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, error, isLoading, mutate } = useSWR<BookmarkEntry[]>(
    tickets.bookmarksUrl(),
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 10_000 },
  );

  function openTicket(key: string) {
    router.push(`/tickets/${key}`);
    onClose();
  }

  const entries = data ?? [];

  return (
    <div data-testid="bookmarks-view">
      <button
        type="button"
        onClick={onBack}
        style={revealStyle(open, 1)}
        className="group flex w-full items-center gap-2 rounded-xl px-1.5 py-2 text-left transition-colors duration-150 cursor-pointer hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <ChevronLeft className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.5} />
        <Bookmark className="h-[18px] w-[18px] shrink-0 text-[var(--meta-bv-fg)]" strokeWidth={1.5} />
        <span className="text-body-sm font-medium text-text-primary">Bookmarks</span>
      </button>

      {error ? (
        <div className="px-1 py-3" style={revealStyle(open, 2)}>
          <DataErrorState error={error} onRetry={() => void mutate()} />
        </div>
      ) : isLoading && entries.length === 0 ? (
        // Skeleton rows so opening feels instant instead of flashing the empty state.
        <div className="flex flex-col px-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 border-t border-border-subtle py-2.5 first:border-t-0" style={revealStyle(open, 2 + i)}>
              <span className="h-4 w-16 shrink-0 rounded bg-overlay-default" />
              <span className="h-3 flex-1 rounded bg-overlay-subtle" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-2 py-10 text-center" style={revealStyle(open, 2)}>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-overlay-default">
            <Bookmark className="h-4 w-4 text-[var(--meta-bv-fg)]" strokeWidth={1.5} />
          </span>
          <p className="text-body-sm text-text-muted">No bookmarks yet</p>
          <p className="max-w-[260px] text-label leading-body text-text-muted/70">
            Bookmark a story from its page, a board row, the right-click menu or the editor to keep it here for quick reference.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col px-1">
            {entries.map((entry, i) => (
              <BookmarkRow
                key={entry.key}
                entry={entry}
                index={i}
                open={open}
                isCurrent={pathname.includes(entry.key)}
                onOpen={openTicket}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border-subtle px-1.5 pt-2">
            <span className="font-mono text-caption uppercase tracking-label text-text-muted">
              {entries.length} bookmark{entries.length === 1 ? "" : "s"}
            </span>
            <Link
              href="/bookmarks"
              prefetch
              onClick={onClose}
              className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-label font-medium text-text-secondary transition-colors duration-150 hover:text-[var(--color-brand-300)] active:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              See all
              <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
