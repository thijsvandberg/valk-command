import { db } from "@/db";
import { newStoryRead, ticketMetadata, ticket, appSetting } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

// Per-user read state for the New story inbox (BRDG-359). Read state used to live
// on the shared ticketMetadata.newStoryReadAt column; it is now a row per
// (acting user, ticket) so marking a story read affects only that user. All
// functions take the resolved userId explicitly so they are unit-testable
// without a request scope.

// One-time guard so the legacy backfill copies the old global read flags into the
// per-user store exactly once (for the first user who loads the inbox).
const BACKFILL_FLAG_KEY = "new_story_read_backfilled";

/** Mark a single ticket read (upsert) or unread (delete) for the given user. */
export async function markNewStoryRead(
  userId: string,
  ticketKey: string,
  read: boolean,
): Promise<void> {
  if (read) {
    await db
      .insert(newStoryRead)
      .values({ userId, ticketKey, readAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [newStoryRead.userId, newStoryRead.ticketKey],
        set: { readAt: new Date().toISOString() },
      })
      .run();
  } else {
    await db
      .delete(newStoryRead)
      .where(and(eq(newStoryRead.userId, userId), eq(newStoryRead.ticketKey, ticketKey)))
      .run();
  }
}

/**
 * Bulk mark many tickets read/unread for one user (multi-select). Only operates
 * on keys that resolve to a real ticket so a stray key cannot persist a read row
 * for a non-existent ticket. Returns the count of valid keys actually touched.
 */
export async function bulkMarkNewStoriesRead(
  userId: string,
  keys: string[],
  read: boolean,
): Promise<{ updated: number }> {
  const unique = [...new Set(keys.filter((k) => typeof k === "string" && k.length > 0))];
  if (unique.length === 0) return { updated: 0 };

  const existingTickets = await db
    .select({ jiraKey: ticket.jiraKey })
    .from(ticket)
    .where(inArray(ticket.jiraKey, unique));
  const validKeys = existingTickets.map((t) => t.jiraKey);
  if (validKeys.length === 0) return { updated: 0 };

  if (read) {
    const readAt = new Date().toISOString();
    await db
      .insert(newStoryRead)
      .values(validKeys.map((ticketKey) => ({ userId, ticketKey, readAt })))
      .onConflictDoUpdate({
        target: [newStoryRead.userId, newStoryRead.ticketKey],
        set: { readAt },
      })
      .run();
  } else {
    await db
      .delete(newStoryRead)
      .where(and(eq(newStoryRead.userId, userId), inArray(newStoryRead.ticketKey, validKeys)))
      .run();
  }

  return { updated: validKeys.length };
}

/** Ticket keys the given user has marked read. Drives the inbox unread filter. */
export async function getReadTicketKeys(userId: string): Promise<string[]> {
  const rows = await db
    .select({ ticketKey: newStoryRead.ticketKey })
    .from(newStoryRead)
    .where(eq(newStoryRead.userId, userId));
  return rows.map((r) => r.ticketKey);
}

/**
 * One-time lazy migration of the legacy global read flags (BRDG-356's
 * ticketMetadata.newStoryReadAt) into the per-user store for `userId`. A SQL
 * migration cannot know the Clerk user id, so this runs on first inbox load and
 * attributes the existing reads to the first user who loads it (the single PO).
 * Guarded by a global appSetting flag so it never runs twice; a second user does
 * not re-inherit the PO's reads. Existing per-user rows are preserved
 * (onConflictDoNothing).
 */
export async function backfillLegacyNewStoryReads(userId: string): Promise<void> {
  const flag = await db.query.appSetting.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.key, BACKFILL_FLAG_KEY),
  });
  if (flag) return;

  const legacy = await db
    .select({ jiraKey: ticketMetadata.jiraKey, readAt: ticketMetadata.newStoryReadAt })
    .from(ticketMetadata)
    .where(isNotNull(ticketMetadata.newStoryReadAt));

  if (legacy.length > 0) {
    await db
      .insert(newStoryRead)
      .values(
        legacy.map((row) => ({
          userId,
          ticketKey: row.jiraKey,
          readAt: row.readAt as string,
        })),
      )
      .onConflictDoNothing()
      .run();
  }

  await db
    .insert(appSetting)
    .values({ key: BACKFILL_FLAG_KEY, value: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}
