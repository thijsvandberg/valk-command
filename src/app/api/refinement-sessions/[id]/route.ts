import { NextResponse } from "next/server";
import { db } from "@/db";
import { refinementSession } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { emitRefinementEvent } from "@/lib/refinement-events";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { resolveSessionTicketKeys } from "@/lib/draft-sync";

function withParsedKeys(row: typeof refinementSession.$inferSelect) {
  // Promote finalized DRAFT keys to their real Jira keys and dedup, so a session
  // that still references a since-promoted draft shows the live ticket and an
  // accurate count instead of a ghost key (see resolveSessionTicketKeys).
  const keys = resolveSessionTicketKeys(JSON.parse(row.ticketKeys) as string[]);
  return { ...row, ticketKeys: keys, ticketCount: keys.length };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const row = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!row) {
    return errorResponse("Session not found", 404);
  }

  return NextResponse.json(withParsedKeys(row));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const existing = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!existing) {
    return errorResponse("Session not found", 404);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.name !== undefined) {
    if (body.name !== null && typeof body.name !== "string") {
      return errorResponse("name must be a string or null", 400);
    }
    updates.name =
      typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  }

  if (body.scheduledFor !== undefined) {
    if (
      body.scheduledFor !== null &&
      (typeof body.scheduledFor !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(body.scheduledFor))
    ) {
      return errorResponse("scheduledFor must be a YYYY-MM-DD date or null", 400);
    }
    updates.scheduledFor = body.scheduledFor;
  }

  if (body.ticketKeys !== undefined) {
    if (!Array.isArray(body.ticketKeys)) {
      return errorResponse("ticketKeys must be an array of strings", 400);
    }
    const keys = body.ticketKeys.filter(
      (k): k is string => typeof k === "string" && k.trim() !== "",
    );
    updates.ticketKeys = JSON.stringify(keys);
  }

  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "in_progress" && body.status !== "completed") {
      return errorResponse("status must be 'draft', 'in_progress', or 'completed'", 400);
    }
    updates.status = body.status;
  }

  if (body.generalComment !== undefined) {
    if (body.generalComment !== null && typeof body.generalComment !== "string") {
      return errorResponse("generalComment must be a string or null", 400);
    }
    updates.generalComment = body.generalComment;
  }

  if (body.currentIndex !== undefined) {
    if (typeof body.currentIndex !== "number" || body.currentIndex < 0 || !Number.isInteger(body.currentIndex)) {
      return errorResponse("currentIndex must be a non-negative integer", 400);
    }
    updates.currentIndex = body.currentIndex;
  }

  // A session must keep at least one identity: a name or a scheduled date
  const nextName = "name" in updates ? updates.name : existing.name;
  const nextScheduledFor =
    "scheduledFor" in updates ? updates.scheduledFor : existing.scheduledFor;
  if (!nextName && !nextScheduledFor) {
    return errorResponse("Session needs a name or a date", 400);
  }

  await db
    .update(refinementSession)
    .set(updates)
    .where(eq(refinementSession.id, id));

  const updated = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!updated) {
    return errorResponse("Session not found after update", 500);
  }

  emitRefinementEvent({ type: "session:updated", sessionId: id });

  return NextResponse.json(withParsedKeys(updated));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const existing = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!existing) {
    return errorResponse("Session not found", 404);
  }

  await db.delete(refinementSession).where(eq(refinementSession.id, id));

  emitRefinementEvent({ type: "session:deleted", sessionId: id });

  return new NextResponse(null, { status: 204 });
}
