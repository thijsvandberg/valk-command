import { NextResponse } from "next/server";
import { db } from "@/db";
import { refinementSession } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

function withParsedKeys(row: typeof refinementSession.$inferSelect) {
  const keys = JSON.parse(row.ticketKeys) as string[];
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
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(withParsedKeys(row));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const existing = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim() === "") {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 },
      );
    }
    updates.name = body.name.trim();
  }

  if (body.ticketKeys !== undefined) {
    if (!Array.isArray(body.ticketKeys)) {
      return NextResponse.json(
        { error: "ticketKeys must be an array of strings" },
        { status: 400 },
      );
    }
    const keys = body.ticketKeys.filter(
      (k): k is string => typeof k === "string" && k.trim() !== "",
    );
    updates.ticketKeys = JSON.stringify(keys);
  }

  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "in_progress" && body.status !== "completed") {
      return NextResponse.json(
        { error: "status must be 'draft', 'in_progress', or 'completed'" },
        { status: 400 },
      );
    }
    updates.status = body.status;
  }

  if (body.generalComment !== undefined) {
    if (body.generalComment !== null && typeof body.generalComment !== "string") {
      return NextResponse.json(
        { error: "generalComment must be a string or null" },
        { status: 400 },
      );
    }
    updates.generalComment = body.generalComment;
  }

  if (body.currentIndex !== undefined) {
    if (typeof body.currentIndex !== "number" || body.currentIndex < 0 || !Number.isInteger(body.currentIndex)) {
      return NextResponse.json(
        { error: "currentIndex must be a non-negative integer" },
        { status: 400 },
      );
    }
    updates.currentIndex = body.currentIndex;
  }

  await db
    .update(refinementSession)
    .set(updates)
    .where(eq(refinementSession.id, id));

  const updated = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!updated) {
    return NextResponse.json({ error: "Session not found after update" }, { status: 500 });
  }

  return NextResponse.json(withParsedKeys(updated));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const { id } = await params;
  const invalid = validatePathParam(id);
  if (invalid) return invalid;

  const existing = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await db.delete(refinementSession).where(eq(refinementSession.id, id));

  return new NextResponse(null, { status: 204 });
}
