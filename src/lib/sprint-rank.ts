import { db } from "@/db";
import { ticket, sprintNameCache, appSetting } from "@/db/schema";
import { and, or, eq, ne, asc, isNull, isNotNull } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { isBacklogSprintName, isRegularSprint } from "@/lib/sprint-utils";
import { trailingDoneDepStart } from "@/lib/sprint-insert-position";
import { logger } from "@/lib/logger";

/**
 * Place a freshly created ticket in its destination per the unified placement rule
 * (BRDG-371, which reverses BRDG-354): a regular numbered sprint lands the new story
 * at the BOTTOM (above the trailing done/deprecated block, refined client-side); a
 * backlog (named like "BT: Backlog", or the generic project backlog) lands it at the
 * TOP. New stories are always TO DO, so the move rule's in-flight exception never
 * applies here.
 *
 * Two layers are needed because the board sorts by the LOCAL jiraRank (nulls last)
 * while Jira holds the canonical order:
 *  - Jira: rank the issue so it survives the next full sync, which overwrites the
 *    local jiraRank from Jira's order.
 *  - Local mirror: give it a jiraRank that shows it in the right spot immediately;
 *    without this its rank stays null and the board sorts it last until the sync.
 *
 * Best-effort: every step is guarded and never throws. The ticket is already created
 * and in its destination, so a ranking hiccup must not surface to the user. The local
 * row for `key` must already exist with sprintName === String(assignedSprintId), or
 * the backlog sentinel ("" / null) when assignedSprintId is null.
 */
export async function landNewTicket(key: string, assignedSprintId: string | null): Promise<void> {
  if (assignedSprintId === null) {
    await rankToTopOfBacklog(key);
    return;
  }

  const sprintIdNum = parseInt(assignedSprintId, 10);
  if (Number.isNaN(sprintIdNum)) return;

  const name = await sprintDisplayName(assignedSprintId);
  // A named backlog, or an unresolved/unrecognized name, lands at the top (the safe
  // default that never buries a ticket); a regular numbered sprint lands at the bottom.
  if (name !== null && isRegularSprint(name) && !isBacklogSprintName(name)) {
    await rankToBottomOfSprint(key, sprintIdNum, assignedSprintId);
  } else {
    await rankToTopOfSprint(key, sprintIdNum, assignedSprintId);
  }
}

/** Resolve a sprint id to its display name: sprint_name_cache first, then the cached jira_sprints list. */
async function sprintDisplayName(sprintId: string): Promise<string | null> {
  try {
    const cached = await db
      .select({ displayName: sprintNameCache.displayName })
      .from(sprintNameCache)
      .where(eq(sprintNameCache.sprintId, sprintId))
      .limit(1);
    if (cached[0]?.displayName) return cached[0].displayName;
  } catch (err) {
    logger.warn("sprint-rank", `sprint_name_cache lookup failed for ${sprintId}: ${err}`);
  }

  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, "jira_sprints"),
    });
    if (row) {
      const list = JSON.parse(row.value) as Array<{ id: number | string; name: string }>;
      const match = list.find((s) => String(s.id) === sprintId);
      if (match?.name) return match.name;
    }
  } catch {
    // ignore corrupt/absent cache
  }
  return null;
}

async function rankToTopOfSprint(key: string, sprintIdNum: number, sprintName: string): Promise<void> {
  try {
    await jiraClient.rankToTopOfSprint([key], sprintIdNum);
  } catch (err) {
    logger.warn("sprint-rank", `Jira rank-to-top failed for ${key} in sprint ${sprintIdNum}: ${err}`);
  }
  try {
    const peers = await db
      .select({ jiraRank: ticket.jiraRank })
      .from(ticket)
      .where(and(eq(ticket.sprintName, sprintName), isNotNull(ticket.jiraRank), ne(ticket.jiraKey, key)))
      .orderBy(asc(ticket.jiraRank))
      .limit(1);
    const topRank = peers[0]?.jiraRank;
    // Below the current minimum (or 0 when there are no ranked peers). A value below 0
    // still sorts ahead of everything; the next sync resets it to Jira's.
    const newRank = topRank != null ? topRank - 1 : 0;
    await db.update(ticket).set({ jiraRank: newRank }).where(eq(ticket.jiraKey, key));
  } catch (err) {
    logger.warn("sprint-rank", `Local rank-to-top failed for ${key} in sprint ${sprintIdNum}: ${err}`);
  }
}

async function rankToBottomOfSprint(key: string, sprintIdNum: number, sprintName: string): Promise<void> {
  try {
    await jiraClient.rankToBottomOfSprint([key], sprintIdNum);
  } catch (err) {
    logger.warn("sprint-rank", `Jira rank-to-bottom failed for ${key} in sprint ${sprintIdNum}: ${err}`);
  }
  try {
    const peers = await db
      .select({ jiraKey: ticket.jiraKey, jiraRank: ticket.jiraRank, status: ticket.status })
      .from(ticket)
      .where(and(eq(ticket.sprintName, sprintName), isNotNull(ticket.jiraRank), ne(ticket.jiraKey, key)))
      .orderBy(asc(ticket.jiraRank));

    // "Bottom of the sprint" means above the trailing done/deprecated block, not below
    // everything. Mirror the client optimistic placement (trailingDoneDepStart) so the
    // server rank matches and the row never snaps once the board revalidates. The next
    // sync resets the local rank to Jira's order.
    const insertIdx = trailingDoneDepStart(peers.map((p) => ({ jiraStatus: p.status })));

    if (insertIdx >= peers.length) {
      // No trailing finished block: append below the current maximum (0 when no peers).
      const bottomRank = peers[peers.length - 1]?.jiraRank;
      const newRank = bottomRank != null ? bottomRank + 1 : 0;
      await db.update(ticket).set({ jiraRank: newRank }).where(eq(ticket.jiraKey, key));
      return;
    }

    // Shift the trailing finished block down by one and slot the new story into the gap.
    const insertRank = peers[insertIdx].jiraRank!;
    for (const p of peers.slice(insertIdx)) {
      await db.update(ticket).set({ jiraRank: p.jiraRank! + 1 }).where(eq(ticket.jiraKey, p.jiraKey));
    }
    await db.update(ticket).set({ jiraRank: insertRank }).where(eq(ticket.jiraKey, key));
  } catch (err) {
    logger.warn("sprint-rank", `Local rank-to-bottom failed for ${key} in sprint ${sprintIdNum}: ${err}`);
  }
}

async function rankToTopOfBacklog(key: string): Promise<void> {
  try {
    await jiraClient.rankToTopOfBacklog([key]);
  } catch (err) {
    logger.warn("sprint-rank", `Jira rank-to-top-of-backlog failed for ${key}: ${err}`);
  }
  try {
    // Backlog rows carry the empty/absent sprint sentinel ("" or null).
    const peers = await db
      .select({ jiraRank: ticket.jiraRank })
      .from(ticket)
      .where(and(or(eq(ticket.sprintName, ""), isNull(ticket.sprintName)), isNotNull(ticket.jiraRank), ne(ticket.jiraKey, key)))
      .orderBy(asc(ticket.jiraRank))
      .limit(1);
    const topRank = peers[0]?.jiraRank;
    const newRank = topRank != null ? topRank - 1 : 0;
    await db.update(ticket).set({ jiraRank: newRank }).where(eq(ticket.jiraKey, key));
  } catch (err) {
    logger.warn("sprint-rank", `Local rank-to-top-of-backlog failed for ${key}: ${err}`);
  }
}
