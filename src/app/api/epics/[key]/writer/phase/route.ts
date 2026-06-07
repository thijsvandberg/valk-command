import { NextResponse } from "next/server";
import { z } from "zod";
import { validatePathParam } from "@/lib/api-validation";
import { parseJsonBody } from "@/lib/request-parser";
import { errorResponse, validationError } from "@/lib/api-response";
import { db } from "@/db";
import { storyWriterSession } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { EPIC_WRITER_PHASES } from "@/types/epic-writer";

type RouteContext = { params: Promise<{ key: string }> };

const patchPhaseSchema = z.object({
  phase: z.enum(EPIC_WRITER_PHASES),
});

/**
 * Updates the epic session's phase bookmark. Free movement: any phase is
 * reachable from any phase (no transition guard in BRDG-292).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const bodyResult = await parseJsonBody(request);
  if ("error" in bodyResult) return bodyResult.error;

  const parsed = patchPhaseSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return validationError(parsed.error);
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

    await db
      .update(storyWriterSession)
      .set({ phase: parsed.data.phase, updatedAt: new Date().toISOString() })
      .where(eq(storyWriterSession.id, session.id));

    const updated = await db
      .select()
      .from(storyWriterSession)
      .where(eq(storyWriterSession.id, session.id))
      .get();

    return NextResponse.json({ session: updated });
  } catch (err) {
    logger.error("epic-writer", "PATCH phase failed", err);
    return errorResponse("Failed to update phase", 500);
  }
}
