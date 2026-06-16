import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { countNewStories } from "@/lib/new-stories-query";

const CACHE_KEY = "/api/new-stories/count";

// GET /api/new-stories/count - unread count for the nav badge (BRDG-356). Same
// filter as the list; invalidated together with it on every mark-read write.
export async function GET() {
  const cached = cache.get<{ count: number }>(CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
    });
  }

  const count = await countNewStories();
  const result = { count };
  cache.set(CACHE_KEY, result, 30_000);

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
