import { NextRequest, NextResponse } from "next/server";
import { confluenceClient } from "@/lib/confluence-client";
import { applyRateLimit } from "@/lib/rate-limiter";

/**
 * GET /api/confluence/search?q=searchTerm
 *
 * CQL title search against the configured Confluence space.
 */
export async function GET(req: NextRequest) {
  const limited = applyRateLimit("read");
  if (limited) return limited;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

  if (!confluenceClient.isLive) {
    return NextResponse.json({ error: "Confluence not configured" }, { status: 503 });
  }

  try {
    const results = await confluenceClient.searchPages(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
