import { NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineRun } from "@/db/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";

// GET /api/pipelines/last-deployed - returns last deployment per ticket key
// Response: Record<ticketKey, { environment, completedAt, state }>
export async function GET() {
  const rows = db
    .select({
      ticketKey: pipelineRun.ticketKey,
      ticketKeys: pipelineRun.ticketKeys,
      environment: pipelineRun.environment,
      completedAt: pipelineRun.completedAt,
      state: pipelineRun.state,
    })
    .from(pipelineRun)
    .where(
      and(
        eq(pipelineRun.isDeployment, true),
        isNotNull(pipelineRun.completedAt),
      ),
    )
    .orderBy(desc(pipelineRun.completedAt))
    .all();

  // Deduplicate: keep only the latest deployment per ticket. A deploy can be attributed to
  // several tickets via ticket_keys (BRDG-269: every ticket merged in since the previous
  // deploy), so each key in that set gets a badge, not only the single triggering ticket_key.
  const result: Record<string, { environment: string | null; completedAt: string | null; state: string }> = {};
  for (const row of rows) {
    const keys = new Set<string>();
    if (row.ticketKey) keys.add(row.ticketKey);
    if (row.ticketKeys) {
      try {
        for (const k of JSON.parse(row.ticketKeys) as string[]) keys.add(k);
      } catch {
        // Malformed JSON: fall back to the primary key already added.
      }
    }
    for (const key of keys) {
      if (!result[key]) {
        result[key] = {
          environment: row.environment,
          completedAt: row.completedAt,
          state: row.state,
        };
      }
    }
  }

  return NextResponse.json(result);
}
