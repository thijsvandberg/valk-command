import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, epicChildDraft, ticket, ticketMetadata } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { markdownToAdf } from "@/lib/markdown-to-adf";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Promotes one DRAFT child card to a real Jira issue under the epic. Nothing
 * reaches Jira until this is pressed (the breakdown lives as local cards until
 * then). The issue is created with parentKey = epic, so Jira's modern hierarchy
 * establishes the epic-child link at creation time (no separate link call). The
 * card's worked-out body (from the detail phase or a PO edit) becomes the
 * description; a bullets-only card sends its bullets so the issue is not empty.
 *
 * On success the card flips to status "created" with its jiraKey set, so the
 * board shows DRAFT vs created and the issue can no longer be re-created.
 *
 * Placement (sprint | backlog | default) is accepted here so the Create-in-Jira
 * menu is wired end to end, but the actual sprint move lands in BRDG-296; this
 * route records the intent and leaves the issue in the backlog for now.
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

  const cardIndex = typeof body.cardIndex === "number" ? body.cardIndex : Number.NaN;
  if (!Number.isInteger(cardIndex) || cardIndex < 0) {
    return errorResponse("cardIndex must be a non-negative integer", 400);
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

    const card = await db
      .select()
      .from(epicChildDraft)
      .where(
        and(
          eq(epicChildDraft.sessionId, session.id),
          eq(epicChildDraft.cardIndex, cardIndex),
        ),
      )
      .get();

    if (!card) {
      return errorResponse("Card not found", 404);
    }

    // Idempotency guard: a card already promoted keeps its Jira key. Re-pressing
    // must not create a duplicate issue.
    if (card.status === "created" && card.jiraKey) {
      return NextResponse.json({ ok: true, cardIndex, jiraKey: card.jiraKey, alreadyCreated: true });
    }

    // The worked-out body wins; otherwise the bullets seed the description so the
    // promoted issue carries the breakdown content rather than landing empty.
    const bullets = Array.isArray(card.bullets) ? card.bullets : [];
    const descriptionText =
      card.body && card.body.trim().length > 0
        ? card.body
        : bullets.length > 0
          ? bullets.map((b) => `- ${b}`).join("\n")
          : "";

    let jiraKey: string;
    try {
      const result = await jiraClient.createIssue({
        summary: card.title,
        issueType: "Story",
        // parentKey establishes the epic-child link in modern Jira hierarchy.
        parentKey: key,
        description: descriptionText
          ? markdownToAdf(descriptionText)
          : { type: "doc", version: 1, content: [] },
      });
      jiraKey = result.key;
    } catch (err) {
      logger.error("epic-writer", "create-in-jira: Jira creation failed", err);
      return errorResponse("Failed to create story in Jira", 502);
    }

    const now = new Date().toISOString();

    // Local ticket + metadata so the new child resolves like any synced ticket
    // (epicKey ties it to the epic for the board's child queries).
    db.transaction((tx) => {
      tx.insert(ticket).values({
        jiraKey,
        title: card.title,
        type: "story",
        status: "TO DO",
        epicKey: key,
        description: descriptionText || null,
      }).run();

      tx.insert(ticketMetadata).values({
        jiraKey,
        readiness: "drafting",
      }).run();

      tx.update(epicChildDraft)
        .set({ status: "created", jiraKey, updatedAt: now })
        .where(eq(epicChildDraft.id, card.id))
        .run();
    });

    await logActivity({
      type: "story-writer",
      scope: key,
      summary: `Created epic child in Jira: ${jiraKey} (${card.title})`,
    });

    return NextResponse.json({ ok: true, cardIndex, jiraKey }, { status: 201 });
  } catch (err) {
    logger.error("epic-writer", "create-in-jira failed", err);
    return errorResponse("Failed to create story in Jira", 500);
  }
}
