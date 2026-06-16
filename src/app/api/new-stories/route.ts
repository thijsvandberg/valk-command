import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { listNewStories } from "@/lib/new-stories-query";
import type { NewStoriesResponse } from "@/lib/new-stories-types";

const CACHE_KEY = "/api/new-stories";

// GET /api/new-stories - unread, recently-created stories for the review inbox
// (BRDG-356). Cached briefly; the metadata write path invalidates this key when
// a ticket is marked read/unread.
export async function GET() {
  const cached = cache.get<NewStoriesResponse>(CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
    });
  }

  const rows = await listNewStories();
  const result: NewStoriesResponse = { rows };
  cache.set(CACHE_KEY, result, 30_000);

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
