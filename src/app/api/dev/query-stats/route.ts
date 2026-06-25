import { NextResponse } from "next/server";
import { getQueryStats, SLOW_QUERY_THRESHOLD_MS } from "@/lib/query-timer";

// Dev-only diagnostics endpoint (BRDG-404).
// GET /api/dev/query-stats — returns in-memory slow-query aggregates.
//
// Gated to development to match GET /api/dev/bypass; the SQL identities are
// parameterized (value-free), but the aggregates are still a diagnostics-only
// signal, so they are not exposed in production.

export function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    thresholdMs: SLOW_QUERY_THRESHOLD_MS,
    queries: getQueryStats(),
  });
}
