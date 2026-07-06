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
 * Edits one child card in place. The AI fills the card during breakdown/refine,
 * but the PO can then hand-edit it; this is the persistence path for that edit.
 * A partial patch of any of title / bullets / body is accepted (each optional),
 * so the PO can rename a DRAFT card, retype its bullets, or reword its body
 * (BRDG-490 #5). An empty body clears the detail, dropping the card's depth back
 * to bullets; the title must stay non-empty.
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

  const patch: { title?: string; bullets?: string[]; body?: string | null } = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return errorResponse("title must be a non-empty string", 400);
    }
    patch.title = body.title.trim();
  }

  if ("bullets" in body) {
    if (!Array.isArray(body.bullets) || body.bullets.some((b) => typeof b !== "string")) {
      return errorResponse("bullets must be an array of strings", 400);
    }
    // Drop blank lines so an accidental trailing empty bullet is not persisted.
    patch.bullets = (body.bullets as string[]).map((b) => b.trim()).filter((b) => b.length > 0);
  }

  if ("body" in body) {
    if (body.body !== null && typeof body.body !== "string") {
      return errorResponse("body must be a string or null", 400);
    }
    const trimmed = typeof body.body === "string" ? body.body.trim() : "";
    patch.body = trimmed.length > 0 ? trimmed : null;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse("Provide at least one of title, bullets, or body", 400);
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

    const now = new Date().toISOString();
    await db
      .update(epicChildDraft)
      .set({ ...patch, updatedAt: now })
      .where(eq(epicChildDraft.id, card.id));

    return NextResponse.json({ ok: true, cardIndex, ...patch });
  } catch (err) {
    logger.error("epic-writer", "PATCH card body failed", err);
    return errorResponse("Failed to update card", 500);
  }
}
