import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, epicChildDraft, ticket, ticketMetadata, appSetting } from "@/db/schema";
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
 * Placement (sprint | backlog | default) is applied right after the local rows
 * exist, reusing the same sprint plumbing as the board: a concrete sprint id
 * goes through jiraClient.moveToSprint, "__backlog__" leaves the issue in the
 * backlog (a fresh issue is already there, so it is a no-op), and "__default__"
 * resolves to the configured default_sprint_id setting (an empty value there
 * means backlog). A failed sprint move does not undo the created issue: the card
 * stays created and the PO can reassign afterwards via the existing move-sprint.
 */

const BACKLOG_PLACEMENT = "__backlog__";
const DEFAULT_PLACEMENT = "__default__";

/**
 * Resolves the PO's placement choice to a concrete sprint id, or null for the
 * backlog. "__default__" reads the existing default_sprint_id setting; an empty
 * setting there means backlog (no default configured). Any other value is taken
 * as a concrete sprint id and used verbatim.
 */
async function resolvePlacementSprintId(placement: string | undefined): Promise<string | null> {
  if (!placement || placement === BACKLOG_PLACEMENT) return null;
  if (placement === DEFAULT_PLACEMENT) {
    const row = await db
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, "default_sprint_id"))
      .get();
    const value = row?.value?.trim() ?? "";
    return value.length > 0 ? value : null;
  }
  return placement;
}
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

  const placement = typeof body.placement === "string" ? body.placement : undefined;

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

    // Apply the chosen sprint placement, reusing the same Jira sprint plumbing
    // the board uses for reassignment. A fresh issue lands in the backlog, so
    // the backlog case needs no move. A move failure does not undo the created
    // issue; the PO can reassign afterwards via the existing move-sprint path.
    const targetSprintId = await resolvePlacementSprintId(placement);
    let sprintMoveFailed = false;
    if (targetSprintId) {
      const sprintIdNum = Number.parseInt(targetSprintId, 10);
      if (Number.isInteger(sprintIdNum)) {
        try {
          await jiraClient.moveToSprint([jiraKey], sprintIdNum);
          await db
            .update(ticket)
            .set({
              sprintName: targetSprintId,
              sprintIds: JSON.stringify([targetSprintId]),
            })
            .where(eq(ticket.jiraKey, jiraKey));
        } catch (err) {
          logger.error("epic-writer", "create-in-jira: sprint placement failed", err);
          sprintMoveFailed = true;
        }
      }
    }

    await logActivity({
      type: "story-writer",
      scope: key,
      summary: `Created epic child in Jira: ${jiraKey} (${card.title})`,
    });

    return NextResponse.json(
      { ok: true, cardIndex, jiraKey, sprintId: sprintMoveFailed ? null : targetSprintId, sprintMoveFailed },
      { status: 201 },
    );
  } catch (err) {
    logger.error("epic-writer", "create-in-jira failed", err);
    return errorResponse("Failed to create story in Jira", 500);
  }
}
