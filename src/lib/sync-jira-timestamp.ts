import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * After Bridge pushes a metadata change to Jira, Jira's `updated` timestamp
 * advances. We must sync that new timestamp back so the conflict detector in
 * pushToJira() does not flag Bridge's own change as an external conflict.
 */
export async function syncJiraTimestamp(key: string): Promise<void> {
  try {
    const issue = await jiraClient.getIssue(key);
    const newUpdated = issue.fields.updated;
    if (newUpdated) {
      await db.update(ticket).set({ jiraUpdatedAt: newUpdated }).where(eq(ticket.jiraKey, key));
      cache.invalidate(`/api/tickets/${key}`);
    }
  } catch (err) {
    logger.error("sync-jira-timestamp", `Failed to sync jiraUpdatedAt after metadata push for ${key}:`, err);
  }
}

/**
 * Bulk variant of {@link syncJiraTimestamp}: refresh `jiraUpdatedAt` for many keys
 * with a single bulk fetch instead of one `getIssue` per key (BRDG-408). Same
 * per-key effect (skip keys with no `updated`, invalidate the per-key cache) and
 * the same swallow-and-log error stance, so a failure never fails the caller.
 */
export async function syncJiraTimestamps(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const issues = await jiraClient.getIssuesByKeys(keys);
    const updates = issues
      .map((issue) => ({ key: issue.key, updated: issue.fields.updated }))
      .filter((u): u is { key: string; updated: string } => Boolean(u.updated));
    if (updates.length === 0) return;

    db.transaction((tx) => {
      for (const { key, updated } of updates) {
        tx.update(ticket).set({ jiraUpdatedAt: updated }).where(eq(ticket.jiraKey, key)).run();
      }
    });

    for (const { key } of updates) {
      cache.invalidate(`/api/tickets/${key}`);
    }
  } catch (err) {
    logger.error("sync-jira-timestamp", `Failed to bulk-sync jiraUpdatedAt after rank for ${keys.length} keys:`, err);
  }
}
