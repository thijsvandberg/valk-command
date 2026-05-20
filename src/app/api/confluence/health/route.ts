import { NextResponse } from "next/server";
import { confluenceClient } from "@/lib/confluence-client";
import { logger } from "@/lib/logger";

/**
 * GET /api/confluence/health
 *
 * Verifies Confluence connectivity and credentials.
 */
export async function GET() {
  if (!confluenceClient.isLive) {
    return NextResponse.json({
      ok: false,
      live: false,
      error: "Confluence credentials not configured",
    });
  }

  try {
    const result = await confluenceClient.checkHealth();
    return NextResponse.json({ ok: true, live: true, user: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("confluence-health", "Health check failed", message);
    return NextResponse.json({ ok: false, live: false, error: "Confluence health check failed" });
  }
}
