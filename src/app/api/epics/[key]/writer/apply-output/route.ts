import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, epicChildDraft } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { extractEpicQuestions, extractEpicBreakdown, extractStoryDetails } from "@/lib/epic-breakdown-parser";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Parses break-down-epic output for an epic session. Persists the child cards
 * from an <epic-breakdown> block into epic_child_draft (replacing the prior set,
 * since the skill returns the full breakdown each turn) and reports whether a
 * discovery <epic-questions> block is present. The assistant chat message itself
 * is saved by the shared apply-draft path; this route only owns the cards.
 *
 * Created cards (already promoted to Jira, a later story) are preserved across
 * re-parses by matching on cardIndex: a re-emitted card at the same index keeps
 * its jiraKey/status. Parsing failures never throw, so a malformed turn leaves
 * the existing breakdown untouched.
 *
 * Detail-phase output (<story-detail index="N">) is handled separately: it
 * merges a worked-out body onto the named cards in place (filling
 * epic_child_draft.body, which drives the depth badge to "full"). A deepen turn
 * typically carries only <story-detail> blocks and no <epic-breakdown>, so
 * detailing must apply even when the breakdown set is left untouched.
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
  const output = typeof body.output === "string" ? body.output : "";

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

    const hasQuestions = extractEpicQuestions(output) !== null;
    const cards = extractEpicBreakdown(output);
    const details = extractStoryDetails(output);

    const now = new Date().toISOString();
    const existing = await db
      .select()
      .from(epicChildDraft)
      .where(eq(epicChildDraft.sessionId, session.id))
      .all();
    const priorByIndex = new Map(existing.map((c) => [c.cardIndex, c] as const));

    // Detail blocks merge a worked-out body onto cards already on the board;
    // they can only apply where a card exists at the named index.
    const applicableDetails = (details ?? []).filter((d) => priorByIndex.has(d.index));
    const detailByIndex = new Map(applicableDetails.map((d) => [d.index, d.body] as const));

    // Null = no breakdown block (or unparseable): leave the card set as-is, but
    // still apply any detail bodies (a deepen turn carries only <story-detail>).
    if (cards === null) {
      if (detailByIndex.size === 0) {
        return NextResponse.json({
          hasQuestions,
          cardCount: 0,
          detailedCount: 0,
          applied: false,
        });
      }

      db.transaction((tx) => {
        for (const [index, body] of detailByIndex) {
          tx.update(epicChildDraft)
            .set({ body, updatedAt: now })
            .where(
              and(
                eq(epicChildDraft.sessionId, session.id),
                eq(epicChildDraft.cardIndex, index),
              ),
            )
            .run();
        }
      });

      await db
        .update(storyWriterSession)
        .set({ updatedAt: now })
        .where(eq(storyWriterSession.id, session.id));

      await logActivity({
        type: "story-writer",
        scope: key,
        summary: `Epic stories detailed: ${detailByIndex.size}`,
      });

      return NextResponse.json({
        hasQuestions,
        cardCount: 0,
        detailedCount: detailByIndex.size,
        applied: true,
      });
    }

    // Preserve created cards' Jira state by index across the wholesale replace.
    db.transaction((tx) => {
      tx.delete(epicChildDraft).where(eq(epicChildDraft.sessionId, session.id)).run();
      cards.forEach((card, idx) => {
        const prior = priorByIndex.get(idx);
        const wasCreated = prior?.status === "created";
        // A detail block in the same turn wins; then a body already on the card
        // (e.g. the skill re-emitted the breakdown without the prior body);
        // then a fresh body from the breakdown card itself.
        const detailedBody = detailByIndex.get(idx);
        tx.insert(epicChildDraft).values({
          id: randomUUID(),
          sessionId: session.id,
          cardIndex: idx,
          title: card.title,
          bullets: card.bullets,
          body: detailedBody ?? card.body ?? prior?.body ?? null,
          status: wasCreated ? "created" : "draft",
          jiraKey: wasCreated ? prior?.jiraKey ?? null : null,
          suggestedSprintId: card.suggestedSprintId,
          suggestedLinks: card.suggestedLinks,
          updatedAt: now,
        }).run();
      });
    });

    await db
      .update(storyWriterSession)
      .set({ updatedAt: now })
      .where(eq(storyWriterSession.id, session.id));

    await logActivity({
      type: "story-writer",
      scope: key,
      summary: `Epic breakdown updated: ${cards.length} cards`,
    });

    return NextResponse.json({
      hasQuestions,
      cardCount: cards.length,
      detailedCount: detailByIndex.size,
      applied: true,
    });
  } catch (err) {
    logger.error("epic-writer", "apply-output failed", err);
    return errorResponse("Failed to apply epic breakdown output", 500);
  }
}
