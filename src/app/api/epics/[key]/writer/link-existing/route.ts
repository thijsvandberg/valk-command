import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, epicChildDraft, ticket } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { updateTicketFields } from "@/lib/ticket-detail-builder";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Links one or more EXISTING stories into the epic as children (BRDG-487):
 * re-parents each to the epic in Jira and adds it to the breakdown board.
 *
 * Unlike create-in-jira (which creates brand-new issues), this re-parents stories
 * that already exist. Re-parenting reuses the same primitive as the board's
 * "set epic" (`updateTicketFields({ epicKey })` -> `jiraClient.updateIssue(parent)`),
 * so the epic-child link is established in Jira and the local mirror's epicKey is
 * updated. A `created` epic_child_draft card is added per linked story (unless one
 * already exists for that key) so it shows on the breakdown board next to the
 * generated cards.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const rawKeys = Array.isArray(body.jiraKeys) ? body.jiraKeys : [];
  const jiraKeys = [...new Set(
    rawKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim()),
  )].filter((k) => k !== key); // never re-parent the epic to itself
  if (jiraKeys.length === 0) {
    return errorResponse("jiraKeys must contain at least one story key", 400);
  }

  try {
    const session = await db
      .select()
      .from(storyWriterSession)
      .where(
        and(
          eq(storyWriterSession.ticketKey, key),
          eq(storyWriterSession.status, "active"),
          eq(storyWriterSession.mode, "epic"),
        ),
      )
      .get();

    if (!session) {
      return errorResponse("No active epic writer session", 404);
    }

    const existingCards = await db
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, session.id))
      .all();
    const cardByJiraKey = new Map(
      existingCards.filter((c) => c.jiraKey).map((c) => [c.jiraKey as string, c] as const),
    );
    let nextIndex = existingCards.reduce((max, c) => Math.max(max, c.cardIndex), -1) + 1;

    const linked: string[] = [];
    const failed: string[] = [];

    for (const childKey of jiraKeys) {
      const childTicket = await db.query.ticket.findFirst({
        where: (row, { eq: eqFn }) => eqFn(row.jiraKey, childKey),
      });
      if (!childTicket) {
        failed.push(childKey);
        continue;
      }
      if (childTicket.type === "epic") {
        // An epic cannot be a child of another epic.
        failed.push(childKey);
        continue;
      }

      const outcome = await updateTicketFields(childKey, { epicKey: key });
      if (outcome && "error" in outcome) {
        failed.push(childKey);
        continue;
      }

      const now = new Date().toISOString();
      const prior = cardByJiraKey.get(childKey);
      if (prior) {
        // Already on the board (e.g. a created card); just ensure it is marked created.
        db.update(epicChildDraft)
          .set({ status: "created", jiraKey: childKey, updatedAt: now })
          .where(eq(epicChildDraft.id, prior.id))
          .run();
      } else {
        db.insert(epicChildDraft).values({
          id: randomUUID(),
          sessionId: session.id,
          cardIndex: nextIndex,
          title: childTicket.title ?? childKey,
          bullets: [],
          body: childTicket.description ?? null,
          status: "created",
          jiraKey: childKey,
          updatedAt: now,
        }).run();
        nextIndex += 1;
      }
      linked.push(childKey);
    }

    if (linked.length === 0) {
      return errorResponse("None of the stories could be linked", 422);
    }

    await db
      .update(storyWriterSession)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(storyWriterSession.id, session.id));

    await logActivity({
      type: "story-writer",
      scope: key,
      summary: `Linked existing stories to epic: ${linked.join(", ")}`,
    });

    return NextResponse.json({ ok: true, linked, failed });
  } catch (err) {
    logger.error("epic-writer", "link-existing failed", err);
    return errorResponse("Failed to link existing stories", 500);
  }
}
