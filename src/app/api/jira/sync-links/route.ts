import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketLink } from "@/db/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { normalizeIssueType, normalizeStatus } from "@/lib/upsert-issue";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 50;

/**
 * POST /api/jira/sync-links
 *
 * One-time bulk sync of issue links from Jira for all tickets in the DB.
 * Uses a lightweight JQL query fetching only the issuelinks field.
 */
export async function POST(request: Request) {
  const allTickets = await db
    .select({ jiraKey: ticket.jiraKey })
    .from(ticket)
    .all();

  const keys = allTickets.map((t) => t.jiraKey);
  logger.info("sync-links", `Starting link sync for ${keys.length} tickets`);

  let synced = 0;
  let batchErrors = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);

    try {
      const issues = await jiraClient.getIssueLinksByKeys(batch, request.signal);

      for (const issue of issues) {
        const issuelinks = issue.fields.issuelinks ?? [];

        // Get locally-created links (jiraLinkId IS NULL) to preserve them
        const localLinks = await db
          .select({ id: ticketLink.id, linkedKey: ticketLink.linkedKey })
          .from(ticketLink)
          .where(and(eq(ticketLink.ticketKey, issue.key), isNull(ticketLink.jiraLinkId)))
          .all();
        const localLinkMap = new Map(localLinks.map((l) => [l.linkedKey, l.id]));

        // Delete all Jira-sourced links for this ticket
        db.delete(ticketLink).where(
          and(eq(ticketLink.ticketKey, issue.key), isNotNull(ticketLink.jiraLinkId)),
        ).run();

        // Upsert from Jira data
        for (const link of issuelinks) {
          const linked = link.inwardIssue ?? link.outwardIssue;
          if (!linked) continue;
          const relation = link.inwardIssue ? link.type.inward : link.type.outward;

          const linkData = {
            jiraLinkId: link.id,
            relation,
            title: linked.fields.summary,
            type: normalizeIssueType(linked.fields.issuetype.name),
            status: normalizeStatus(linked.fields.status.name),
            assignee: linked.fields.assignee?.displayName ?? null,
            assigneeAvatar: linked.fields.assignee?.avatarUrls?.["48x48"] ?? null,
          };

          const localId = localLinkMap.get(linked.key);
          if (localId) {
            db.update(ticketLink).set(linkData).where(eq(ticketLink.id, localId)).run();
          } else {
            db.insert(ticketLink).values({
              id: `link-${issue.key}-${link.id}`,
              ticketKey: issue.key,
              linkedKey: linked.key,
              ...linkData,
            }).onConflictDoNothing().run();
          }
        }

        synced++;
      }

      logger.info("sync-links", `Batch ${Math.floor(i / BATCH_SIZE) + 1}: synced ${issues.length} tickets`);
    } catch (err) {
      logger.error("sync-links", `Batch failed at offset ${i}: ${err}`);
      batchErrors++;
    }
  }

  cache.invalidate("/api/tickets");
  logger.info("sync-links", `Link sync complete: ${synced} tickets synced, ${batchErrors} batch errors`);

  return NextResponse.json({ synced, batchErrors, total: keys.length });
}
