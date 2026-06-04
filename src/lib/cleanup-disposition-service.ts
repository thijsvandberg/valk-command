/**
 * Server-side disposition writer for the Backlog Deprecation Review epic
 * (BRDG-289). Shared by the single-ticket and bulk disposition API routes so
 * the DB write, the activity-log entry, and the "local-only" guarantee live in
 * exactly one place.
 *
 * HARD CONSTRAINT: this only ever writes ticketMetadata (the Bridge-private
 * layer). It must never call any Jira client. Tests assert no Jira write path
 * is reachable from here.
 */

import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity-logger";
import {
  computeDispositionFields,
  type DispositionAction,
} from "@/lib/cleanup-disposition";

export interface ApplyDispositionResult {
  /** Keys that existed and were updated. */
  applied: string[];
  /** Keys that did not match an eligible ticket and were skipped. */
  skipped: string[];
}

const ACTION_VERB: Record<DispositionAction, string> = {
  confirm: "Confirmed",
  dismiss: "Dismissed",
  reset: "Reset disposition for",
};

/**
 * Apply a disposition action to one or more tickets, then write a single
 * activity-log entry summarising the batch. Returns which keys were applied vs
 * skipped (a key with no ticket row is skipped, not created).
 */
export async function applyDisposition(
  keys: string[],
  action: DispositionAction,
  opts: { note?: string | null; now?: number; cooldownDays?: number } = {},
): Promise<ApplyDispositionResult> {
  const fields = computeDispositionFields(action, opts);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const key of keys) {
    const exists = await db
      .select({ jiraKey: ticket.jiraKey })
      .from(ticket)
      .where(eq(ticket.jiraKey, key))
      .get();
    if (!exists) {
      skipped.push(key);
      continue;
    }
    // Upsert on the local metadata layer only. No Jira write happens here.
    await db
      .insert(ticketMetadata)
      .values({ jiraKey: key, ...fields })
      .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: fields });
    applied.push(key);
  }

  if (applied.length > 0) {
    const verb = ACTION_VERB[action];
    const scope = applied.length === 1 ? applied[0] : `${applied.length} tickets`;
    await logActivity({
      type: "deprecation-scan",
      scope,
      summary: `${verb} ${applied.length === 1 ? applied[0] : `${applied.length} backlog tickets`} (local disposition, no Jira write)`,
      status: "success",
    });
  }

  return { applied, skipped };
}
