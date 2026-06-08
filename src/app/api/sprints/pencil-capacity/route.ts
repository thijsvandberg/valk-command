import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sprintPencilCapacity } from "@/db/schema";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

// Forward-planning pencil capacity (BRDG-303). Bridge-local, never synced to
// Jira. GET returns every sprint's capacity; PUT upserts one sprint's value,
// deleting the row when capacity is null so "unset" stays distinct from 0.

export async function GET() {
  const rows = await db.select().from(sprintPencilCapacity);
  return NextResponse.json(rows);
}

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { sprintId?: unknown; capacity?: unknown };

  if (typeof body.sprintId !== "string" || body.sprintId.trim() === "") {
    return errorResponse("sprintId is required and must be a non-empty string", 400);
  }

  const sprintId = body.sprintId.trim();
  const { capacity } = body;

  if (capacity === null || capacity === undefined) {
    await db.delete(sprintPencilCapacity).where(eq(sprintPencilCapacity.sprintId, sprintId));
    return NextResponse.json({ sprintId, capacity: null });
  }

  if (typeof capacity !== "number" || !Number.isFinite(capacity) || capacity < 0 || capacity > 999) {
    return errorResponse("capacity must be a number between 0 and 999, or null", 400);
  }

  await db
    .insert(sprintPencilCapacity)
    .values({ sprintId, capacity })
    .onConflictDoUpdate({
      target: sprintPencilCapacity.sprintId,
      set: { capacity },
    });

  return NextResponse.json({ sprintId, capacity });
}
