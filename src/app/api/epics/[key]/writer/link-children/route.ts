import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, epicChildDraft, ticket, ticketLink } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

// The relation the AI proposes is a human label (e.g. "blocks", "relates to").
// Map it to a Jira link type + direction so the link is created on the right
// side. Mirrors the fallback mapping the per-ticket links route uses.
const RELATION_TO_JIRA: Record<string, { type: string; direction: "outward" | "inward" }> = {
  "relates to": { type: "Relates", direction: "outward" },
  "blocks": { type: "Blocks", direction: "outward" },
  "is blocked by": { type: "Blocks", direction: "inward" },
  "clones": { type: "Cloners", direction: "outward" },
  "is cloned by": { type: "Cloners", direction: "inward" },
  "duplicates": { type: "Duplicate", direction: "outward" },
  "is duplicated by": { type: "Duplicate", direction: "inward" },
};

// The inverse relation label, used for the reverse local link row so both
// tickets show the relationship from their own side.
const INVERSE_RELATION: Record<string, string> = {
  "relates to": "relates to",
  "blocks": "is blocked by",
  "is blocked by": "blocks",
  "clones": "is cloned by",
  "is cloned by": "clones",
  "duplicates": "is duplicated by",
  "is duplicated by": "duplicates",
};

/**
 * Creates one PO-confirmed inter-story link between two child cards of the epic.
 * The AI proposes links (epicChildDraft.suggestedLinks) but nothing reaches Jira
 * until the PO confirms a specific one here; this route is that confirmation
 * step. Both cards must already be created in Jira (a link needs real issue
 * keys), so the source must be promoted via create-in-jira first.
 *
 * On success the Jira link is created, bidirectional local ticketLink rows are
 * inserted (so each ticket shows the relation from its own side), and the
 * matching suggestedLink on the source card is marked confirmed so the UI hides
 * the confirm affordance and shows it as established.
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

  const sourceIndex = typeof body.sourceIndex === "number" ? body.sourceIndex : Number.NaN;
  const targetIndex = typeof body.targetIndex === "number" ? body.targetIndex : Number.NaN;
  const relation = typeof body.relation === "string" ? body.relation.trim().toLowerCase() : "";

  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
    return errorResponse("sourceIndex must be a non-negative integer", 400);
  }
  if (!Number.isInteger(targetIndex) || targetIndex < 0) {
    return errorResponse("targetIndex must be a non-negative integer", 400);
  }
  if (sourceIndex === targetIndex) {
    return errorResponse("A card cannot be linked to itself", 400);
  }
  if (!relation) {
    return errorResponse("relation is required", 400);
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

    const cards = await db
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, session.id))
      .all();

    const sourceCard = cards.find((c) => c.cardIndex === sourceIndex);
    const targetCard = cards.find((c) => c.cardIndex === targetIndex);

    if (!sourceCard || !targetCard) {
      return errorResponse("Card not found", 404);
    }

    // A real Jira link needs two real issues; both ends must be promoted first.
    if (sourceCard.status !== "created" || !sourceCard.jiraKey) {
      return errorResponse("Source card must be created in Jira before linking", 409);
    }
    if (targetCard.status !== "created" || !targetCard.jiraKey) {
      return errorResponse("Target card must be created in Jira before linking", 409);
    }

    const sourceKey = sourceCard.jiraKey;
    const destKey = targetCard.jiraKey;
    const mapping = RELATION_TO_JIRA[relation] ?? { type: "Relates", direction: "outward" as const };
    const isInward = mapping.direction === "inward";

    try {
      await jiraClient.createIssueLink(
        isInward ? destKey : sourceKey,
        isInward ? sourceKey : destKey,
        mapping.type,
      );
    } catch (err) {
      logger.error("epic-writer", "link-children: Jira link failed", err);
      return errorResponse("Failed to create link in Jira", 502);
    }

    const inverse = INVERSE_RELATION[relation] ?? "relates to";
    const now = new Date().toISOString();

    // ticketLink.ticketKey has an FK to ticket.jiraKey. A created card normally
    // has a local ticket row (create-in-jira inserts one), but a child promoted
    // in a prior session may not be resolved locally yet; ensure both ends exist
    // so the link rows insert cleanly.
    for (const [jiraKey, title] of [
      [sourceKey, sourceCard.title],
      [destKey, targetCard.title],
    ] as const) {
      const exists = await db.select({ k: ticket.jiraKey }).from(ticket).where(eq(ticket.jiraKey, jiraKey)).get();
      if (!exists) {
        await db.insert(ticket).values({
          jiraKey,
          title,
          type: "story",
          status: "TO DO",
          epicKey: key,
        }).onConflictDoNothing();
      }
    }

    db.transaction((tx) => {
      // Forward local link, skipped if an identical local-only row already exists
      // (re-confirming must not duplicate rows).
      const forwardExists = tx
        .select({ id: ticketLink.id })
        .from(ticketLink)
        .where(
          and(
            eq(ticketLink.ticketKey, sourceKey),
            eq(ticketLink.linkedKey, destKey),
            eq(ticketLink.relation, relation),
            isNull(ticketLink.jiraLinkId),
          ),
        )
        .get();

      if (!forwardExists) {
        tx.insert(ticketLink).values({
          id: randomUUID(),
          ticketKey: sourceKey,
          relation,
          linkedKey: destKey,
          title: targetCard.title,
          type: "story",
          status: "TO DO",
        }).run();
      }

      const reverseExists = tx
        .select({ id: ticketLink.id })
        .from(ticketLink)
        .where(
          and(
            eq(ticketLink.ticketKey, destKey),
            eq(ticketLink.linkedKey, sourceKey),
            eq(ticketLink.relation, inverse),
            isNull(ticketLink.jiraLinkId),
          ),
        )
        .get();

      if (!reverseExists) {
        tx.insert(ticketLink).values({
          id: randomUUID(),
          ticketKey: destKey,
          relation: inverse,
          linkedKey: sourceKey,
          title: sourceCard.title,
          type: "story",
          status: "TO DO",
        }).run();
      }

      // Mark the matching suggested link confirmed so the UI reflects it as
      // established (match by target + relation, case-insensitive on relation).
      const suggested = Array.isArray(sourceCard.suggestedLinks) ? sourceCard.suggestedLinks : [];
      const nextLinks = suggested.map((l) =>
        l.targetIndex === targetIndex && l.relation.trim().toLowerCase() === relation
          ? { ...l, confirmed: true }
          : l,
      );
      tx.update(epicChildDraft)
        .set({ suggestedLinks: nextLinks, updatedAt: now })
        .where(eq(epicChildDraft.id, sourceCard.id))
        .run();
    });

    await logActivity({
      type: "metadata-update",
      scope: key,
      summary: `Linked epic children: ${sourceKey} ${relation} ${destKey}`,
    });

    return NextResponse.json({ ok: true, sourceKey, destKey, relation });
  } catch (err) {
    logger.error("epic-writer", "link-children failed", err);
    return errorResponse("Failed to link epic children", 500);
  }
}
