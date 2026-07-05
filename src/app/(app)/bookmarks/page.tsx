"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Bookmark } from "lucide-react";
import type { Ticket, JiraStatus } from "@/types/ticket";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import type { BookmarkEntry } from "@/lib/bookmarks";
import { tickets as ticketsApi, swrFetcher } from "@/lib/api-client";
import { BoardRow } from "@/components/sprint-board/BoardRow";
import { ViewHeader } from "@/components/shared/ViewHeader";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import {
  registerPendingEdit,
  confirmPendingEdit,
  clearPendingEdit,
} from "@/components/sprint-board/pendingTicketEdits";

// The standard board rows show these signals; the bookmark badge and status pill
// render regardless. Bookmarks carry a PO note, so the notes marker is on.
const ROW_TAGS: Set<InlineTagId> = new Set(["notes"]);

// Lightweight Ticket so a standard BoardRow paints from the single /api/bookmarks
// payload (mirrors the inbox's rowToTicket). Opening a row re-derives full detail.
function entryToTicket(e: BookmarkEntry): Ticket {
  return {
    key: e.key,
    title: e.title,
    type: e.type,
    epic: null,
    epicKey: null,
    jiraStatus: (e.jiraStatus ?? "TO DO") as JiraStatus,
    storyPoints: null,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: e.notes,
    bookmarked: true,
    sprintId: e.sprintName ?? undefined,
    sprintDisplayName: e.sprintName,
    openSubtaskCount: 0,
    totalSubtaskCount: 0,
  };
}

// Full cross-sprint overview of every bookmarked ticket (BRDG-355), most-recently
// bookmarked first. Renders the SAME BoardRow the sprint board and inbox use — not a
// bespoke table — fed by the shared batch endpoint. A dedicated page rather than the
// SprintBoard component, which is bound to /sprint-board URL routing and slot state.
export default function BookmarksPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<BookmarkEntry[]>(
    ticketsApi.bookmarksUrl(),
    swrFetcher,
    { revalidateOnFocus: false },
  );
  const entries = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => entries.map(entryToTicket), [entries]);
  // The row's sprint chip resolves its label from this map; the entry's display name
  // doubles as the id (bookmarks have no real sprint ids here), like the inbox.
  const sprintNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    entries.forEach((e) => { if (e.sprintName) m[e.sprintName] = e.sprintName; });
    return m;
  }, [entries]);

  const removeBookmark = useCallback(async (key: string) => {
    // Optimistically drop the row; the board overlay carries the un-bookmark to any
    // mounted board row so its badge clears too.
    registerPendingEdit(key, "bookmarked", false, Date.now());
    void mutate((cur) => (cur ?? []).filter((b) => b.key !== key), { revalidate: false });
    try {
      await ticketsApi.setBookmarked(key, false);
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
              <table className="w-full table-fixed border-collapse text-body-lg">
                <tbody>
                  {rows.map((t, i) => (
                    <BoardRow
                      key={t.key}
                      ticket={t}
                      ticketIdx={i}
                      isChecked={false}
                      isSelected={false}
                      someChecked={false}
                      isDragActive={false}
                      hideRowAccent
                      tags={ROW_TAGS}
                      showSprint
                      sprintNameMap={sprintNameMap}
                      onSelectTicket={(key) => { if (key) router.push(`/tickets/${key}`); }}
                      onCheckboxClick={() => {}}
                      onToggleBookmark={(key, next) => { if (!next) void removeBookmark(key); }}
                      isLastInCard={i === rows.length - 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
