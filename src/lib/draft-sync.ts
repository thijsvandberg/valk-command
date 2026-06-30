import { db } from "@/db";
import { ticket, ticketMetadata, ticketLocalEdit, storyWriterSession, conversation, activityLog } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { syncTicketSprints } from "@/lib/sprint-membership";
import { landNewTicket } from "@/lib/sprint-rank";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { isDraftKey } from "@/lib/draft-key";
import { eq } from "drizzle-orm";

export { isDraftKey };

/**
 * Resolves a DRAFT-xxx key to its real Jira key if the draft has been finalized.
 * Returns the input key unchanged for non-draft keys or still-pending drafts.
 */
export function resolveDraftKey(key: string): string {
  if (!isDraftKey(key)) return key;
  const row = db.select().from(ticket).where(eq(ticket.jiraKey, key)).get();
  if (row?.status === "REPLACED" && row.description) return row.description;
  return key;
}

/**
 * Normalizes a refinement session's stored ticket keys for display and counting:
 * promotes any finalized DRAFT-xxx key to its real Jira key, then drops duplicates
 * (a draft can resolve to a key already present in the queue, e.g. when both the
 * draft and its promoted ticket were added). Order is preserved by first occurrence.
 * The resolver is injectable so the dedup logic can be unit-tested without a DB.
 */
export function resolveSessionTicketKeys(
  keys: string[],
  resolve: (key: string) => string = resolveDraftKey,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const resolved = resolve(key);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

interface DraftSyncParams {
  title?: string;
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
      summary: params.title || "Untitled draft",
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

  // Jira ignores the sprint field on create, so assign it via the field-edit path
  // once the issue exists, mirroring the board create flow (BRDG-354).
  let assignedSprintId: string | undefined;
  const sprintId =
    typeof params.sprintId === "string" && params.sprintId.trim() ? params.sprintId.trim() : undefined;
  if (sprintId) {
    const sprintIdNum = parseInt(sprintId, 10);
    if (!Number.isNaN(sprintIdNum)) {
      try {
        await jiraClient.moveToSprint([realKey], sprintIdNum);
        assignedSprintId = sprintId;
      } catch (err) {
        logger.error("draft-sync", `Created ${realKey} but sprint assignment to ${sprintId} failed: ${err}`);
      }
    }
  }

  finalizeDraft(draftKey, realKey, assignedSprintId);

  // Place it per the unified create rule (BRDG-371) now that the real row exists:
  // bottom of a regular sprint, top of a backlog. Best-effort.
  if (assignedSprintId) {
    await landNewTicket(realKey, assignedSprintId);
  }

  cache.invalidate(/^\/api\/tickets(\?|$)/);
  if (assignedSprintId) cache.invalidate("/api/jira/sprints");
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
        sprintIds: sprintName ? JSON.stringify([sprintName]) : null,
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

      // Migrate local edits to the real key
      tx.update(ticketLocalEdit)
        .set({ ticketKey: realKey })
        .where(eq(ticketLocalEdit.ticketKey, draftKey))
        .run();

      // Mark draft row as replaced; description stores real key for lookup
      tx.update(ticket)
        .set({ status: "REPLACED", description: realKey })
        .where(eq(ticket.jiraKey, draftKey))
        .run();

      // Mirror sprint membership into the indexed bridge so the by-sprint board
      // shows the finalized story in its column (BRDG-354).
      if (sprintName) {
        syncTicketSprints(tx, realKey, [sprintName], sprintName);
      }
    });

    logger.info("draft-sync", `Finalized ${draftKey} -> ${realKey}`);
  } catch (err) {
    logger.error("draft-sync", "Finalize transaction failed:", err);
    db.update(ticket)
      .set({ status: "DRAFT_FAILED", description: "Internal error during finalization" })
      .where(eq(ticket.jiraKey, draftKey))
      .run();
  }
}
