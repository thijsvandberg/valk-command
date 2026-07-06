import { NextResponse } from "next/server";
import { z } from "zod";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse, validationError } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, epicChildDraft } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

const reorderSchema = z.object({
  // The card ids (epic_child_draft.id) in their new top-to-bottom order.
  orderedIds: z.array(z.string().min(1)).min(1),
});

// Temp offset applied to every card_index before writing the final values, so the
// (session_id, card_index) unique index never trips mid-reorder: offset values are
// far above the final 0..N-1 range, so setting each card to its final index one at
// a time can't collide with a not-yet-updated card.
const TEMP_OFFSET = 1_000_000;

/**
 * Persist a manual reorder of the breakdown cards (BRDG-487 #10). The body lists
 * the card ids in their new order; card_index is reassigned to 0..N-1 to match.
 *
 * Card links reference other cards by index (suggestedLinks[].targetIndex), so
 * every link is remapped through the old-index -> new-index table in the same
 * transaction. Without that remap a "blocks card 3" link would silently point at
 * whatever card landed in slot 3 after the move.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalidKey = validatePathParam(key);
  if (invalidKey) return invalidKey;

  const parsedBody = await parseJsonBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const parsed = reorderSchema.safeParse(parsedBody.data);
  if (!parsed.success) return validationError(parsed.error);
  const { orderedIds } = parsed.data;

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

    // The new order must be a permutation of exactly the current cards: same ids,
    // no duplicates, none missing. Reject anything else so a stale client can't
    // drop or invent cards.
    const currentIds = new Set(cards.map((c) => c.id));
    const requestedIds = new Set(orderedIds);
    const sameSet =
      currentIds.size === requestedIds.size &&
      orderedIds.length === cards.length &&
      orderedIds.every((id) => currentIds.has(id));
    if (!sameSet) {
      return errorResponse("orderedIds must be a permutation of the current cards", 400);
    }

    const oldIndexById = new Map(cards.map((c) => [c.id, c.cardIndex]));
    // old card_index -> new card_index (position in the requested order).
    const oldToNew = new Map<number, number>();
    orderedIds.forEach((id, newIndex) => {
      oldToNew.set(oldIndexById.get(id) as number, newIndex);
    });

    const now = new Date().toISOString();
    db.transaction((tx) => {
      // Phase 1: park every card at a collision-proof temp index.
      for (const card of cards) {
        tx
          .update(epicChildDraft)
          .set({ cardIndex: card.cardIndex + TEMP_OFFSET })
          .where(eq(epicChildDraft.id, card.id))
          .run();
      }
      // Phase 2: write the final index and remap each card's link targets.
      orderedIds.forEach((id, newIndex) => {
        const card = cards.find((c) => c.id === id);
        if (!card) return;
        const remappedLinks = (card.suggestedLinks ?? []).map((link) => {
          const mapped = oldToNew.get(link.targetIndex);
          return mapped === undefined ? link : { ...link, targetIndex: mapped };
        });
        tx
          .update(epicChildDraft)
          .set({ cardIndex: newIndex, suggestedLinks: remappedLinks, updatedAt: now })
          .where(eq(epicChildDraft.id, id))
          .run();
      });
    });

    return NextResponse.json({ ok: true, orderedIds });
  } catch (err) {
    logger.error("epic-writer", "PUT reorder cards failed", err);
    return errorResponse("Failed to reorder cards", 500);
  }
}
