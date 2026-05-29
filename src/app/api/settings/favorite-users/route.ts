import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { favoriteUser } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

const favoriteUserSchema = z.object({
  displayName: z.string().min(1).max(200),
});

// GET /api/settings/favorite-users - list all favorite display names
export async function GET() {
  const rows = db.select().from(favoriteUser).all();
  return NextResponse.json(
    { favorites: rows.map((r) => r.displayName) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// POST /api/settings/favorite-users - add a favorite (idempotent)
export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request, favoriteUserSchema);
  if ("error" in parsed) return parsed.error;

  const { displayName } = parsed.data;

  db.insert(favoriteUser)
    .values({ id: randomUUID(), displayName })
    .onConflictDoNothing()
    .run();

  return NextResponse.json({ displayName });
}

// DELETE /api/settings/favorite-users?displayName=...
export async function DELETE(request: Request) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const url = new URL(request.url);
  const displayName = url.searchParams.get("displayName");
  if (!displayName) {
    return errorResponse("displayName required", 400);
  }

  db.delete(favoriteUser)
    .where(eq(favoriteUser.displayName, displayName))
    .run();

  return NextResponse.json({ displayName });
}
