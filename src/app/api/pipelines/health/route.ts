import { NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineRun } from "@/db/schema";
import { desc, isNotNull } from "drizzle-orm";

export interface PipelineHealthEntry {
  status: "green" | "yellow" | "red" | "gray";
  recentFails: number;
  recentTotal: number;
  lastState: string | null;
  lastCompletedAt: string | null;
}

// GET /api/pipelines/health - aggregate pipeline health per ticket
export async function GET() {
  const rows = db
    .select()
    .from(pipelineRun)
    .where(isNotNull(pipelineRun.ticketKey))
    .orderBy(desc(pipelineRun.createdAt))
    .limit(500)
    .all();

  const map: Record<string, PipelineHealthEntry> = {};

  // Group recent runs per ticket key (last 10 per ticket)
  const perTicket = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.ticketKey) continue;
    const arr = perTicket.get(r.ticketKey) ?? [];
    if (arr.length < 10) arr.push(r);
    perTicket.set(r.ticketKey, arr);
  }

  for (const [key, runs] of perTicket) {
    const completed = runs.filter(
      (r) => r.state === "SUCCESSFUL" || r.state === "FAILED" || r.state === "STOPPED",
    );
    const fails = completed.filter((r) => r.state === "FAILED");
    const lastCompleted = completed[0] ?? null;

    let status: PipelineHealthEntry["status"] = "gray";
    if (completed.length > 0) {
      if (fails.length === 0) {
        status = "green";
      } else if (lastCompleted?.state === "FAILED") {
        status = "red";
      } else {
        status = "yellow";
      }
    }

    map[key] = {
      status,
      recentFails: fails.length,
      recentTotal: completed.length,
      lastState: lastCompleted?.state ?? null,
      lastCompletedAt: lastCompleted?.completedAt ?? null,
    };
  }

  return NextResponse.json(map);
}
