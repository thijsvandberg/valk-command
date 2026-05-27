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
