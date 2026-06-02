import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { epicMetadata } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { cache } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limiter";
import { parseJsonBody } from "@/lib/request-parser";
import { sanitizeColor } from "@/lib/epic-metadata";

const setColorSchema = z.object({
  // null clears the color (reset to derived default). Non-null is validated
  // against the curated palette below; off-palette values are rejected.
  color: z.string().nullable(),
});

function readColor(epicKey: string): string | null {
  const row = db
    .select({ color: epicMetadata.color })
    .from(epicMetadata)
    .where(eq(epicMetadata.epicKey, epicKey))
    .get();
  return row?.color ?? null;
}

// GET /api/epics/[key]/color - the epic's PO-assigned color (null when unset)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return NextResponse.json(
    { epicKey: key, color: readColor(key) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// PUT /api/epics/[key]/color - set or clear the epic's color. null resets to default.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;

  const parsed = await parseJsonBody(request, setColorSchema);
  if ("error" in parsed) return parsed.error;

  const requested = parsed.data.color;
  if (requested !== null && sanitizeColor(requested) === null) {
    return NextResponse.json({ error: "Color must be one of the curated palette." }, { status: 400 });
  }
  const color = requested === null ? null : sanitizeColor(requested);

  db.insert(epicMetadata)
    .values({ epicKey: key, color })
    .onConflictDoUpdate({
      target: epicMetadata.epicKey,
      set: { color, updatedAt: sql`(datetime('now'))` },
    })
    .run();

  // The progress aggregation caches colors; drop it so the row reflects the change.
  cache.invalidate("/api/epics/progress");

  return NextResponse.json({ epicKey: key, color });
}
