import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { listNewStories } from "@/lib/new-stories-query";
import { getInboxBaseline } from "@/lib/inbox-digest";
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

  // baselineAt is computed in the same GET (and cached with the rows) so the inbox
  // can mark "new" rows + count them client-side against the same read-based
  // baseline the digest uses (BRDG-438). The mark-read path invalidates the
  // /api/new-stories prefix, so the high-water-mark advances on the next fetch.
  const [rows, baselineAt] = await Promise.all([
    listNewStories(ctx),
    getInboxBaseline(ctx.userId),
  ]);
  const result: NewStoriesResponse = { rows, baselineAt };
  cache.set(cacheKey, result, 30_000);

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
