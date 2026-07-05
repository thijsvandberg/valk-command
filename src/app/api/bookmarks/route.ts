import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { withRequestLog } from "@/lib/request-log";
import { getBookmarks, type BookmarkEntry } from "@/lib/bookmarks";

const CACHE_KEY = "/api/bookmarks";

async function handler() {
  const cached = cache.get<BookmarkEntry[]>(CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
    });
  }

  const result = await getBookmarks();
  cache.set(CACHE_KEY, result, 30_000);

  return NextResponse.json(result, {
    headers: {
      "X-Cache": "MISS",
      "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
    },
  });
}

export const GET = withRequestLog(handler);
