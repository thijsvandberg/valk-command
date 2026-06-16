import { db } from "@/db";
import { ticket } from "@/db/schema";
import { and, eq, ne, asc, isNotNull } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { logger } from "@/lib/logger";

/**
 * Land a freshly created ticket at the top of its sprint (BRDG-354).
 *
 * Two layers are needed because the board sorts by the LOCAL jiraRank (nulls
 * last) while Jira holds the canonical order:
 *  - Jira: rank the issue above the sprint's current top so it survives the next
 *    full sync, which overwrites the local jiraRank from Jira's order.
 *  - Local mirror: give it a jiraRank just below the sprint's current minimum so
 *    the board shows it at the top immediately. Without this its rank stays null
 *    and the board sorts it to the bottom until the next sync.
 *
 * Best-effort: every step is guarded and never throws. The ticket is already
 * created and in the sprint, so a ranking hiccup must not surface to the user.
 * The local row for `key` must already exist with sprintName === String(sprintId).
 */
export async function landTicketAtTopOfSprint(key: string, sprintId: number): Promise<void> {
  try {
    await jiraClient.rankToTopOfSprint([key], sprintId);
  } catch (err) {
    logger.warn("sprint-rank", `Jira rank-to-top failed for ${key} in sprint ${sprintId}: ${err}`);
  }

  try {
    const sprintName = String(sprintId);
    const peers = await db
      .select({ jiraRank: ticket.jiraRank })
      .from(ticket)
      .where(and(eq(ticket.sprintName, sprintName), isNotNull(ticket.jiraRank), ne(ticket.jiraKey, key)))
      .orderBy(asc(ticket.jiraRank))
      .limit(1);
    const topRank = peers[0]?.jiraRank;
    // Below the current minimum (or 0 when there are no ranked peers). A value
    // below 0 still sorts ahead of everything; the next sync resets it to Jira's.
    const newRank = topRank != null ? topRank - 1 : 0;
    await db.update(ticket).set({ jiraRank: newRank }).where(eq(ticket.jiraKey, key));
  } catch (err) {
    logger.warn("sprint-rank", `Local rank-to-top failed for ${key} in sprint ${sprintId}: ${err}`);
  }
}
