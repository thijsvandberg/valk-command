import { NextRequest, NextResponse } from "next/server";
import { confluenceClient } from "@/lib/confluence-client";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

const VALID_MODES = ["title", "text", "cql"] as const;
type SearchMode = (typeof VALID_MODES)[number];

/**
 * GET /api/confluence/search?q=<term>&mode=title|text|cql&space=<optional-space-key>
 *
 * mode=title (default): CQL title match (`title~"term"`)
 * mode=text: CQL full-text search (`text~"term"`)
 * mode=cql: Raw CQL passthrough (q is interpreted as a complete CQL expression)
 *
 * The space parameter narrows title/text searches to a specific Confluence space.
 * It is ignored when mode=cql (the caller controls the full CQL expression).
 */
export async function GET(req: NextRequest) {
  const limited = applyRateLimit("read");
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const rawMode = sp.get("mode") ?? "title";
  if (!VALID_MODES.includes(rawMode as SearchMode)) {
    return NextResponse.json(
      { error: `mode must be one of: ${VALID_MODES.join(", ")}` },
      { status: 400 },
    );
  }
  const mode = rawMode as SearchMode;

  if (mode === "cql" && q.length > 1000) {
    return NextResponse.json(
      { error: "CQL query too long (max 1000 characters)" },
      { status: 400 },
    );
  }

  const space = sp.get("space")?.trim() || undefined;

  if (!confluenceClient.isLive) {
    return NextResponse.json({ error: "Confluence not configured" }, { status: 503 });
  }

  try {
    let results;
    if (mode === "cql") {
      results = await confluenceClient.searchByCql(q);
    } else if (mode === "text") {
      results = await confluenceClient.searchByText(q, space);
    } else {
      results = await confluenceClient.searchPages(q, space);
    }
    return NextResponse.json({ results }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("confluence-search", "Search failed", message);
    return NextResponse.json({ error: "Confluence search failed" }, { status: 502 });
  }
}
