import { db } from "@/db";
import { statusChangeSeen } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

// BRDG-414: per-user "seen" state for the active-sprint status-change review queue,
// mirroring new-story-read-store. Keyed on the individual status-change id, so marking
// one transition seen never hides a LATER transition of the same ticket. Functions take
// the resolved userId explicitly so they are unit-testable without a request scope.

/** Mark a single status change seen (upsert) or unseen (delete) for the given user. */
export async function markStatusChangeSeen(userId: string, statusChangeId: string, seen: boolean): Promise<void> {
  if (seen) {
    await db
      .insert(statusChangeSeen)
      .values({ userId, statusChangeId, seenAt: new Date().toISOString() })
      .onConflictDoNothing()
      .run();
  } else {
    await db
      .delete(statusChangeSeen)
      .where(and(eq(statusChangeSeen.userId, userId), eq(statusChangeSeen.statusChangeId, statusChangeId)))
      .run();
  }
}

/** Bulk mark many status changes seen for one user ("Mark all seen"). Returns the count touched. */
export async function bulkMarkStatusChangesSeen(userId: string, ids: string[]): Promise<{ updated: number }> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return { updated: 0 };

  const seenAt = new Date().toISOString();
  await db
    .insert(statusChangeSeen)
    .values(unique.map((statusChangeId) => ({ userId, statusChangeId, seenAt })))
    .onConflictDoNothing()
    .run();

  return { updated: unique.length };
}
