import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { countNewStories } from "@/lib/new-stories-query";
import { resolveNewStoryQueryCtx } from "@/lib/new-stories-ctx";
import { backfillLegacyNewStoryReads } from "@/lib/new-story-read-store";

// GET /api/new-stories/count - unread count for the nav badge (BRDG-356). Same
// per-user filter as the list (BRDG-359); cache key scoped to the acting user,
// invalidated together with the list on every mark-read write.
export async function GET() {
  const ctx = await resolveNewStoryQueryCtx();
  await backfillLegacyNewStoryReads(ctx.userId);

  const cacheKey = `/api/new-stories/count:${ctx.userId}`;
  const cached = cache.get<{ count: number }>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
    });
  }

  const count = await countNewStories(ctx);
  const result = { count };
  cache.set(cacheKey, result, 30_000);

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
