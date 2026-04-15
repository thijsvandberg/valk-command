import { NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineRun, appSetting } from "@/db/schema";
import { cache } from "@/lib/cache";
import { desc, eq, inArray, and, or, like, isNull } from "drizzle-orm";
import { syncPipelines, isPipelineConfigured } from "@/lib/pipeline-sync";
import { logger } from "@/lib/logger";

export interface PipelineRunPayload {
  id: string;
  repo: string;
  buildNumber: number;
  branchName: string;
  ticketKey: string | null;
  ticketKeys: string[] | null;
  state: "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED" | "PAUSED";
  creator: string | null;
  durationSeconds: number | null;
  pipelineUrl: string;
  isDeployment: boolean;
  environment: string | null;
  environmentType: "Production" | "Staging" | "Test" | null;
  createdAt: string;
  completedAt: string | null;
  commitMessage: string | null;
  sourceBranch: string | null;
  prUrl: string | null;
  prTitle: string | null;
  prAuthor: string | null;
}

// GET /api/pipelines - query persisted pipeline runs (non-blocking, serves DB data immediately)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const ticketKey = url.searchParams.get("ticketKey");
  const sprintTickets = url.searchParams.get("sprintTickets");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  // Fire-and-forget background sync if no recent data (non-blocking)
  const cacheKey = "/api/pipelines:synced";
  const lastSync = cache.get<number>(cacheKey);
  if (!lastSync && isPipelineConfigured()) {
    syncPipelines()
      .then((result) => {
        cache.set(cacheKey, Date.now(), 60_000);
        logger.info("pipelines", "background sync:", result);
      })
      .catch((err) => {
        logger.error("pipelines", "background sync failed:", err);
      });
  }

  // Query persisted data from DB with filters
  const conditions = [];
  if (repo) conditions.push(eq(pipelineRun.repo, repo));
  if (ticketKey) conditions.push(eq(pipelineRun.ticketKey, ticketKey));
  const unlinked = url.searchParams.get("unlinked") === "true";

  if (unlinked) {
    conditions.push(isNull(pipelineRun.ticketKey));
  } else if (sprintTickets) {
    const keys = sprintTickets.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      // Match on primary ticketKey OR any key inside the ticketKeys JSON array
      const ticketKeysConds = keys.map((k) => like(pipelineRun.ticketKeys, `%"${k}"%`));
      conditions.push(or(inArray(pipelineRun.ticketKey, keys), ...ticketKeysConds)!);
    }
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
  const syncing = !lastSync && isPipelineConfigured();

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
    commitMessage: r.commitMessage ?? null,
    sourceBranch: r.sourceBranch ?? null,
    prUrl: r.prUrl ?? null,
    prTitle: r.prTitle ?? null,
    prAuthor: r.prAuthor ?? null,
    ticketKeys: r.ticketKeys ? JSON.parse(r.ticketKeys) : null,
  }));

  // Include sync status: watermark + last tick result
  const watermarkRow = db.select().from(appSetting).where(eq(appSetting.key, "pipeline_sync:watermark")).get();
  const lastResultRow = db.select().from(appSetting).where(eq(appSetting.key, "pipeline_sync:last_result")).get();
  const lastResult = lastResultRow ? JSON.parse(lastResultRow.value) : null;

  const syncStatus = {
    watermark: watermarkRow?.value ?? null,
    remaining: lastResult?.remaining ?? 0,
    lastNewRuns: lastResult?.newRuns ?? 0,
  };

  return NextResponse.json({ runs, hasRunning, syncing, syncStatus });
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
    logger.error("pipelines", "force sync failed:", err);
    return NextResponse.json({ error: "Pipeline sync failed" }, { status: 500 });
  }
}
