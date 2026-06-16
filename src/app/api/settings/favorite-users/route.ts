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
  // Stable Jira accountId (BRDG-364). Optional: people without a captured id
  // fall back to name matching.
  accountId: z.string().min(1).max(200).optional(),
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

  const { displayName, accountId } = parsed.data;

  // Keyed (uniquely) on display name; store the accountId so matching survives a
  // rename, and refresh it on a repeat add once an id becomes available.
  db.insert(favoriteUser)
    .values({ id: randomUUID(), displayName, accountId: accountId ?? null })
    .onConflictDoUpdate({
      target: favoriteUser.displayName,
      set: { accountId: accountId ?? null },
    })
    .run();

  return NextResponse.json({ displayName, accountId: accountId ?? null });
}

// DELETE /api/settings/favorite-users?displayName=...&accountId=...
// accountId, when supplied, is the durable key (removes regardless of a rename);
// displayName remains accepted for name-only favourites.
export async function DELETE(request: Request) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const url = new URL(request.url);
  const displayName = url.searchParams.get("displayName");
  const accountId = url.searchParams.get("accountId");
  if (!displayName && !accountId) {
    return errorResponse("displayName or accountId required", 400);
  }

  db.delete(favoriteUser)
    .where(accountId ? eq(favoriteUser.accountId, accountId) : eq(favoriteUser.displayName, displayName!))
    .run();

  return NextResponse.json({ displayName, accountId });
}
