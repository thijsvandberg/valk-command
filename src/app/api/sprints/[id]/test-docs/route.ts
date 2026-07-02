import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketSprint, sprintNameCache } from "@/db/schema";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";

export interface SprintTestDocItem {
  key: string;
  title: string;
  status: string;
  storyPoints: number | null;
  doc: string | null;
  needsInput?: boolean;
}

/**
 * GET /api/sprints/[id]/test-docs
 *
 * Sprint-level test documentation delivery (BRDG-461). Buckets every real
 * ticket in the sprint for the bundle modal:
 * - documented: validated docs (classification ok, or needs_input flagged),
 *   biggest stories first — the manual BT-style documents lead with the large
 *   features and end with one-liners.
 * - internal: not_stakeholder_relevant one-liners (the "Misc" tail).
 * - missing: DONE/TEST tickets without a doc — the delivery gap list.
 * - other: remaining statuses without a doc (informational only).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("read");
  if (limited) return limited;

  const { id: sprintId } = await params;

  const nameRow = await db
    .select({ displayName: sprintNameCache.displayName })
    .from(sprintNameCache)
    .where(eq(sprintNameCache.sprintId, sprintId))
    .get();

  const rows = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      status: ticket.status,
      storyPoints: ticket.storyPoints,
      doc: ticketMetadata.testDoc,
      classification: ticketMetadata.testDocClassification,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticketMetadata.jiraKey, ticket.jiraKey))
    .where(
      and(
        inArray(
          ticket.jiraKey,
          db
            .select({ k: ticketSprint.ticketKey })
            .from(ticketSprint)
            .where(eq(ticketSprint.sprintId, sprintId)),
        ),
        isNull(ticket.removedFromJiraAt),
        notInArray(ticket.type, ["subtask", "epic"]),
        notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED"]),
      ),
    )
    .all();

  const documented: SprintTestDocItem[] = [];
  const internal: SprintTestDocItem[] = [];
  const missing: SprintTestDocItem[] = [];
  const other: SprintTestDocItem[] = [];

  for (const row of rows) {
    const item: SprintTestDocItem = {
      key: row.key,
      title: row.title,
      status: row.status,
      storyPoints: row.storyPoints,
      doc: row.doc,
    };
    if (row.doc) {
      if (row.classification === "not_stakeholder_relevant") {
        internal.push(item);
      } else {
        // A doc with a null classification predates the column; treat as ok.
        documented.push({ ...item, needsInput: row.classification === "needs_input" });
      }
    } else if (row.status === "DONE" || row.status === "TEST") {
      missing.push(item);
    } else {
      other.push(item);
    }
  }

  // Big features first (SP desc, nulls last), then key for a stable order.
  const bySize = (a: SprintTestDocItem, b: SprintTestDocItem) =>
    (b.storyPoints ?? -1) - (a.storyPoints ?? -1) || a.key.localeCompare(b.key);
  documented.sort(bySize);
  internal.sort(bySize);
  missing.sort(bySize);
  other.sort(bySize);

  return NextResponse.json({
    sprintName: nameRow?.displayName ?? `Sprint ${sprintId}`,
    documented,
    internal,
    missing,
    other,
  });
}
