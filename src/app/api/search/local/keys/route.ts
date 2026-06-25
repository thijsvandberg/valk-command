import { NextResponse } from "next/server";
import { executeLocalKeyMatch } from "@/lib/local-search-engine";
import { logger } from "@/lib/logger";

// Inline sprint-board search (BRDG-345): returns every ticket key whose indexed document
// matches the query across deep fields (description, acceptance criteria, labels, notes,
// comments). The board intersects this set with its currently filtered rows, so no result
// limit or ranking is applied here -- the full matching set is returned.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  try {
    const keys = await executeLocalKeyMatch(q);
    return NextResponse.json({ keys }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    logger.error("search-local-keys", "local key match failed", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
