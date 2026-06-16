import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { listNewStories } from "@/lib/new-stories-query";
import { resolveNewStoryQueryCtx } from "@/lib/new-stories-ctx";
import { backfillLegacyNewStoryReads } from "@/lib/new-story-read-store";
import type { NewStoriesResponse } from "@/lib/new-stories-types";

// GET /api/new-stories - unread, recently-created stories for the review inbox
// (BRDG-356). Read state and self-exclusion are per-user (BRDG-359), so the cache
// key is scoped to the acting user; the metadata write path invalidates the
// /api/new-stories prefix when a ticket is marked read/unread.
export async function GET() {
  const ctx = await resolveNewStoryQueryCtx();
  await backfillLegacyNewStoryReads(ctx.userId);

  const cacheKey = `/api/new-stories:${ctx.userId}`;
  const cached = cache.get<NewStoriesResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
    });
  }

  const rows = await listNewStories(ctx);
  const result: NewStoriesResponse = { rows };
  cache.set(cacheKey, result, 30_000);

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
