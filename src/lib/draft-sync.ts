import { db } from "@/db";
import { ticket, ticketMetadata, storyWriterSession, conversation, activityLog } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";

interface DraftSyncParams {
  title: string;
  sprintId?: string;
  issueType: string;
}

/**
 * Creates the Jira issue and finalizes the draft key swap.
 * Safe to call as a fire-and-forget background task.
 */
export async function syncDraftToJira(draftKey: string, params: DraftSyncParams): Promise<void> {
  let realKey: string;

  try {
    const result = await jiraClient.createIssue({
      summary: params.title,
      sprintId: params.sprintId,
      issueType: params.issueType,
      description: { type: "doc", version: 1, content: [] },
    });
    realKey = result.key;
  } catch (err) {
    logger.error("draft-sync", "Jira creation failed for", draftKey, err);
    const errorMsg = err instanceof Error ? err.message : "Jira creation failed";
    await db.update(ticket)
      .set({ status: "DRAFT_FAILED", description: errorMsg })
      .where(eq(ticket.jiraKey, draftKey));
    return;
  }

  finalizeDraft(draftKey, realKey);
}

/**
 * Atomically swaps a DRAFT-xxx key for the real Jira key across all tables.
 */
export function finalizeDraft(draftKey: string, realKey: string, sprintName?: string): void {
  try {
    db.transaction((tx) => {
      const draft = tx.select().from(ticket).where(eq(ticket.jiraKey, draftKey)).get();
      if (!draft) return;

      tx.insert(ticket).values({
        ...draft,
        jiraKey: realKey,
        status: "TO DO",
        sprintName: sprintName ?? null,
        description: draft.status === "DRAFT_FAILED" ? null : draft.description,
      }).run();

      const meta = tx.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, draftKey)).get();
      if (meta) {
        tx.insert(ticketMetadata).values({ ...meta, jiraKey: realKey }).run();
        tx.delete(ticketMetadata).where(eq(ticketMetadata.jiraKey, draftKey)).run();
      }

      tx.update(storyWriterSession)
        .set({ ticketKey: realKey })
        .where(eq(storyWriterSession.ticketKey, draftKey))
        .run();

      tx.update(conversation)
        .set({ relatedTicket: realKey })
        .where(eq(conversation.relatedTicket, draftKey))
        .run();

      tx.update(activityLog)
        .set({ scope: realKey })
        .where(eq(activityLog.scope, draftKey))
        .run();

      // Mark draft row as replaced; description stores real key for lookup
      tx.update(ticket)
        .set({ status: "REPLACED", description: realKey })
        .where(eq(ticket.jiraKey, draftKey))
        .run();
    });

    logger.info("draft-sync", `Finalized ${draftKey} -> ${realKey}`);
  } catch (err) {
    logger.error("draft-sync", "Finalize transaction failed:", err);
    db.update(ticket)
      .set({ status: "DRAFT_FAILED", description: "Internal error during finalization" })
      .where(eq(ticket.jiraKey, draftKey));
  }
}
