import { db } from "@/db";
import { ticket, ticketMetadata, sprintNameCache } from "@/db/schema";
import { and, desc, eq, isNotNull, notInArray } from "drizzle-orm";
import type { IssueType, JiraStatus } from "@/types/ticket";

// A single, lightweight cross-sprint bookmark row. This is a summary shape, NOT a
// full Ticket: the launcher quick-list renders every row from ONE payload so it
// paints fully-formed with no per-row fetch (the perf problem it fixes, BRDG-355).
export interface BookmarkEntry {
  key: string;
  title: string;
  type: IssueType;
  jiraStatus: JiraStatus;
  // Resolved sprint display name; null = backlog (no sprint or no cache entry).
  sprintName: string | null;
  // The reused PO note (poNotes); "" when none. The list reveals it on hover.
  notes: string;
  bookmarkedAt: string;
}

// Every bookmarked ticket, cross-sprint (incl. backlog), most-recently-bookmarked
// first. Joins metadata -> ticket so a bookmarked backlog ticket with no sprint
// still appears. Draft/subtask/epic rows are excluded to mirror the board.
export async function getBookmarks(): Promise<BookmarkEntry[]> {
  const rows = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
      sprintDisplayName: sprintNameCache.displayName,
      poNotes: ticketMetadata.poNotes,
      bookmarkedAt: ticketMetadata.bookmarkedAt,
    })
    .from(ticketMetadata)
    .innerJoin(ticket, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
    .where(
      and(
        isNotNull(ticketMetadata.bookmarkedAt),
        notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED"]),
      ),
    )
    .orderBy(desc(ticketMetadata.bookmarkedAt));

  // Type filtered in JS (not SQL) so a null-typed row is kept, mirroring the board.
  return rows
    .filter((r) => r.type !== "subtask" && r.type !== "epic")
    .map((r) => ({
      key: r.key,
      title: r.title,
      type: (r.type ?? "story") as IssueType,
      jiraStatus: (r.status ?? "TO DO") as JiraStatus,
      sprintName: r.sprintDisplayName ?? null,
      notes: r.poNotes ?? "",
      bookmarkedAt: r.bookmarkedAt as string,
    }));
}
