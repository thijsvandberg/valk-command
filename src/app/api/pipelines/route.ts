import { NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineRun } from "@/db/schema";
import { cache } from "@/lib/cache";
import { desc, eq, inArray, and } from "drizzle-orm";
import { syncPipelines, isPipelineConfigured } from "@/lib/pipeline-sync";

export interface PipelineRunPayload {
  id: string;
  repo: string;
  buildNumber: number;
  branchName: string;
  ticketKey: string | null;
  state: "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED" | "PAUSED";
  creator: string | null;
  durationSeconds: number | null;
  pipelineUrl: string;
  isDeployment: boolean;
  environment: string | null;
  environmentType: "Production" | "Staging" | "Test" | null;
  createdAt: string;
  completedAt: string | null;
}

// GET /api/pipelines - query persisted pipeline runs (triggers sync if stale)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const ticketKey = url.searchParams.get("ticketKey");
  const sprintTickets = url.searchParams.get("sprintTickets");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  // Inline sync if no recent data (for first load before tick runs)
  const cacheKey = "/api/pipelines:synced";
  const lastSync = cache.get<number>(cacheKey);
  if (!lastSync && isPipelineConfigured()) {
    try {
      const result = await syncPipelines();
      cache.set(cacheKey, Date.now(), 60_000);
      console.log("[pipelines] inline sync:", result);
    } catch (err) {
      console.error("[pipelines] inline sync failed:", err);
    }
  }

  // Query persisted data from DB with filters
  const conditions = [];
  if (repo) conditions.push(eq(pipelineRun.repo, repo));
  if (ticketKey) conditions.push(eq(pipelineRun.ticketKey, ticketKey));
  if (sprintTickets) {
    const keys = sprintTickets.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) conditions.push(inArray(pipelineRun.ticketKey, keys));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(pipelineRun)
    .where(where)
    .orderBy(desc(pipelineRun.createdAt))
    .limit(limit)
    .all();

  const hasRunning = rows.some((r) => r.state === "IN_PROGRESS");

  const runs: PipelineRunPayload[] = rows.map((r) => ({
    id: r.id,
    repo: r.repo,
    buildNumber: r.buildNumber,
    branchName: r.branchName,
    ticketKey: r.ticketKey,
    state: r.state as PipelineRunPayload["state"],
    creator: r.creator,
    durationSeconds: r.durationSeconds,
    pipelineUrl: r.pipelineUrl,
    isDeployment: r.isDeployment,
    environment: r.environment,
    environmentType: r.environmentType as PipelineRunPayload["environmentType"],
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));

  return NextResponse.json({ runs, hasRunning });
}

// POST /api/pipelines - force refresh from Bitbucket
export async function POST() {
  if (!isPipelineConfigured()) {
    return NextResponse.json({ error: "Bitbucket not configured" }, { status: 400 });
  }

  try {
    const result = await syncPipelines();
    cache.set("/api/pipelines:synced", Date.now(), 60_000);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[pipelines] force sync failed:", err);
    return NextResponse.json({ error: "Pipeline sync failed" }, { status: 500 });
  }
}
