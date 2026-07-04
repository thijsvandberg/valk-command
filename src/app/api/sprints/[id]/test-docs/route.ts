import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketSprint, sprintNameCache } from "@/db/schema";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";

export interface SprintTestDocItem {
  key: string;
  title: string;
  type: string;
  status: string;
  storyPoints: number | null;
  epic: string | null;
  doc: string | null;
  needsInput?: boolean;
  /** An unreviewed draft exists (relevant for `missing`: review beats regenerate). */
  hasDraft?: boolean;
  /**
   * Only set on `other` (not-finished) items that carry a doc: true when the doc
   * is classified not_stakeholder_relevant (Misc placement when opted in), false
   * when it belongs in the Documented list. Undefined on every other bucket.
   */
  internalDoc?: boolean;
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
 * - notNeeded: explicitly marked "no test documentation needed" (no doc at
 *   all) — listed separately so they are never re-reviewed as missing.
 * - missing: DONE/TEST tickets without a doc — the delivery gap list.
 * - other: not-finished tickets (any status other than DONE/TEST). Those with a
 *   doc carry it plus `internalDoc` so the bundle modal can offer a per-story
 *   opt-in checkbox for the copy (BRDG-465); those without a doc are informational.
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
      type: ticket.type,
      status: ticket.status,
      storyPoints: ticket.storyPoints,
      epic: ticket.epic,
      doc: ticketMetadata.testDoc,
      classification: ticketMetadata.testDocClassification,
      draft: ticketMetadata.testDocDraft,
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
        // Deprecated work never needs delivery documentation: excluded from
        // every bucket, so it neither counts as missing nor shows as "other".
        notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED", "DEPRECATED"]),
      ),
    )
    .all();

  const documented: SprintTestDocItem[] = [];
  const internal: SprintTestDocItem[] = [];
  const notNeeded: SprintTestDocItem[] = [];
  const missing: SprintTestDocItem[] = [];
  const other: SprintTestDocItem[] = [];

  for (const row of rows) {
    const item: SprintTestDocItem = {
      key: row.key,
      title: row.title,
      type: row.type ?? "task",
      status: row.status,
      storyPoints: row.storyPoints,
      epic: row.epic ?? null,
      doc: row.doc,
      hasDraft: row.draft != null,
    };
    const finished = row.status === "DONE" || row.status === "TEST";
    if (row.doc) {
      if (finished) {
        if (row.classification === "not_stakeholder_relevant") {
          internal.push(item);
        } else {
          // A doc with a null classification predates the column; treat as ok.
          documented.push({ ...item, needsInput: row.classification === "needs_input" });
        }
      } else {
        // Not finished but a doc exists: keep it out of the auto-included copy —
        // the PO opts it in per story via a checkbox in the bundle modal
        // (BRDG-465). Carry the placement hint + needsInput so a checked block
        // renders in the right section with the right tag.
        other.push({
          ...item,
          internalDoc: row.classification === "not_stakeholder_relevant",
          needsInput: row.classification === "needs_input",
        });
      }
    } else if (row.classification === "not_stakeholder_relevant") {
      notNeeded.push(item);
    } else if (finished) {
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
  notNeeded.sort(bySize);
  missing.sort(bySize);
  other.sort(bySize);

  return NextResponse.json({
    sprintName: nameRow?.displayName ?? `Sprint ${sprintId}`,
    documented,
    internal,
    notNeeded,
    missing,
    other,
  });
}
