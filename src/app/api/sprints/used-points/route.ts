import { NextResponse } from "next/server";
import { eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { ticket, ticketMetadata, placeholderTicket } from "@/db/schema";
import { effectivePoints } from "@/types/ticket";

// Forward-planning sprint load (BRDG-303). Returns the total effective points
// (real SP, else guestimation) per sprint across ALL non-draft tickets, so the
// fullness meter on the epic-children-by-sprint view can show how full each
// sprint is in total, not just the share contributed by the open epic.
//
// Sprint membership mirrors GET /api/tickets: a ticket counts toward every
// sprint in its sprint_ids array, falling back to its primary sprint_name when
// that array is absent (pre-sprintIds tickets). Backlog tickets (empty name) and
// drafts are excluded.

export async function GET() {
  const rows = await db
    .select({
      storyPoints: ticket.storyPoints,
      guestimation: ticketMetadata.guestimation,
      sprintIds: ticket.sprintIds,
      sprintName: ticket.sprintName,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED"]));

  const totals: Record<string, number> = {};
  for (const row of rows) {
    const eff = effectivePoints(row.storyPoints, row.guestimation);
    if (eff === 0) continue;
    let ids: string[];
    if (row.sprintIds) {
      try {
        ids = JSON.parse(row.sprintIds) as string[];
      } catch {
        ids = [];
      }
    } else {
      ids = row.sprintName ? [row.sprintName] : [];
    }
    for (const id of ids) {
      if (!id) continue;
      totals[id] = (totals[id] ?? 0) + eff;
    }
  }

  // Active placeholders (BRDG-304) count toward the fullness meter via their
  // guestimation, exactly like an un-pointed real ticket. Promoted placeholders are
  // excluded: their points already arrived as the real ticket above.
  const placeholderRows = await db
    .select({ guestimation: placeholderTicket.guestimation, sprintId: placeholderTicket.sprintId })
    .from(placeholderTicket)
    .where(eq(placeholderTicket.status, "active"));

  for (const row of placeholderRows) {
    if (!row.sprintId) continue;
    const eff = effectivePoints(null, row.guestimation);
    if (eff === 0) continue;
    totals[row.sprintId] = (totals[row.sprintId] ?? 0) + eff;
  }

  return NextResponse.json(
    Object.entries(totals).map(([sprintId, used]) => ({ sprintId, used })),
  );
}
