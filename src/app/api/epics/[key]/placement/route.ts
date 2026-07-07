import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { epicMetadata } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { parseJsonBody } from "@/lib/request-parser";
import { sanitizeChildPlacement, getEpicChildPlacement } from "@/lib/epic-metadata";

const setPlacementSchema = z.object({
  // null clears the setting (each card's Create-in-Jira reverts to today's full
  // dropdown). Non-null is validated below against the allowed value shape.
  placement: z.string().nullable(),
});

// GET /api/epics/[key]/placement - the epic's default child placement (null when unset)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  return NextResponse.json(
    { epicKey: key, placement: getEpicChildPlacement(key) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// PUT /api/epics/[key]/placement - set or clear the epic's default child placement.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;

  const parsed = await parseJsonBody(request, setPlacementSchema);
  if ("error" in parsed) return parsed.error;

  const requested = parsed.data.placement;
  if (requested !== null && sanitizeChildPlacement(requested) === null) {
    return NextResponse.json(
      { error: "Placement must be a sprint id, the backlog, or the default sprint." },
      { status: 400 },
    );
  }
  const placement = requested === null ? null : sanitizeChildPlacement(requested);

  db.insert(epicMetadata)
    .values({ epicKey: key, childPlacement: placement })
    .onConflictDoUpdate({
      target: epicMetadata.epicKey,
      set: { childPlacement: placement, updatedAt: sql`(datetime('now'))` },
    })
    .run();

  return NextResponse.json({ epicKey: key, placement });
}
