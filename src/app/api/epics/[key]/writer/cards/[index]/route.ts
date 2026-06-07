import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, epicChildDraft } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string; index: string }> };

/**
 * Edits one child card's worked-out body in place. The detail phase fills the
 * body via the AI (<story-detail>), but the PO can then refine it by hand; this
 * is the persistence path for that edit, so the depth (and the body sent on a
 * later Create-in-Jira) reflects the PO's own wording. An empty body clears the
 * detail, dropping the card's depth back to bullets.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key, index } = await params;
  const invalidKey = validatePathParam(key);
  if (invalidKey) return invalidKey;

  const cardIndex = Number.parseInt(index, 10);
  if (!Number.isInteger(cardIndex) || cardIndex < 0) {
    return errorResponse("Invalid card index", 400);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;
  if (!("body" in body) || (body.body !== null && typeof body.body !== "string")) {
    return errorResponse("body must be a string or null", 400);
  }
  const trimmed = typeof body.body === "string" ? body.body.trim() : "";
  const nextBody = trimmed.length > 0 ? trimmed : null;

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

    const now = new Date().toISOString();
    await db
      .update(epicChildDraft)
      .set({ body: nextBody, updatedAt: now })
      .where(eq(epicChildDraft.id, card.id));

    return NextResponse.json({ ok: true, cardIndex, body: nextBody });
  } catch (err) {
    logger.error("epic-writer", "PATCH card body failed", err);
    return errorResponse("Failed to update card", 500);
  }
}
