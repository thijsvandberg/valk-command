import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { favoriteUser } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";

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
  const limited = applyRateLimit("write");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = favoriteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { displayName } = parsed.data;

  db.insert(favoriteUser)
    .values({ id: randomUUID(), displayName })
    .onConflictDoNothing()
    .run();

  return NextResponse.json({ displayName });
}

// DELETE /api/settings/favorite-users?displayName=...
export async function DELETE(request: Request) {
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const url = new URL(request.url);
  const displayName = url.searchParams.get("displayName");
  if (!displayName) {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }

  db.delete(favoriteUser)
    .where(eq(favoriteUser.displayName, displayName))
    .run();

  return NextResponse.json({ displayName });
}
