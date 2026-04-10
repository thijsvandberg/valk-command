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
      environment: pipelineRun.environment,
      completedAt: pipelineRun.completedAt,
      state: pipelineRun.state,
    })
    .from(pipelineRun)
    .where(
      and(
        eq(pipelineRun.isDeployment, true),
        isNotNull(pipelineRun.ticketKey),
        isNotNull(pipelineRun.completedAt),
      ),
    )
    .orderBy(desc(pipelineRun.completedAt))
    .all();

  // Deduplicate: keep only the latest deployment per ticket
  const result: Record<string, { environment: string | null; completedAt: string | null; state: string }> = {};
  for (const row of rows) {
    if (row.ticketKey && !result[row.ticketKey]) {
      result[row.ticketKey] = {
        environment: row.environment,
        completedAt: row.completedAt,
        state: row.state,
      };
    }
  }

  return NextResponse.json(result);
}
