import { NextResponse } from "next/server";
import { db } from "@/db";
import { pipelineRun, alert, followedTicket } from "@/db/schema";
import { env } from "@/lib/env";
import { trackOutboundCall } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { desc, eq, inArray, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// Re-export types from dev-info for environment detection
const ENV_PATTERNS: Array<{ pattern: RegExp; environment: string; type: "Production" | "Staging" | "Test" }> = [
  { pattern: /prod(uction)?/i, environment: "Production", type: "Production" },
  { pattern: /uat\s*3/i, environment: "UAT3", type: "Staging" },
  { pattern: /uat\s*2/i, environment: "UAT2", type: "Staging" },
  { pattern: /uat\s*1/i, environment: "UAT1", type: "Staging" },
  { pattern: /staging/i, environment: "Staging", type: "Staging" },
  { pattern: /test/i, environment: "Test", type: "Test" },
];

function detectEnvironment(stepName: string): { environment: string; type: "Production" | "Staging" | "Test" } | null {
  for (const ep of ENV_PATTERNS) {
    if (ep.pattern.test(stepName)) return { environment: ep.environment, type: ep.type };
  }
  return null;
}

const TICKET_KEY_REGEX = /([A-Z][A-Z0-9]+-\d+)/;

function extractTicketKey(branchName: string): string | null {
  const match = branchName.match(TICKET_KEY_REGEX);
  return match ? match[1] : null;
}

function getBitbucketConfig() {
  const repoSlugs = env.BITBUCKET_REPO_SLUG
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    workspace: env.BITBUCKET_WORKSPACE,
    repoSlugs,
    email: env.BITBUCKET_EMAIL || env.JIRA_EMAIL,
    token: env.BITBUCKET_APP_PASSWORD || env.BITBUCKET_API_TOKEN,
  };
}

function isConfigured() {
  const cfg = getBitbucketConfig();
  return Boolean(cfg.workspace && cfg.repoSlugs.length > 0 && cfg.email && cfg.token);
}

interface BbPipelineStep {
  uuid: string;
  name: string;
  state?: { name: string; result?: { name: string } };
  completed_on?: string;
}

interface BbPipeline {
  uuid: string;
  build_number: number;
  state?: { name: string; result?: { name: string } };
  created_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  target?: {
    ref_name?: string;
    ref_type?: string;
    selector?: { type: string };
  };
  links?: { html?: { href: string } };
}

interface BbPaginatedResponse<T> {
  values: T[];
  next?: string;
}

async function bbFetch<T>(repoSlug: string, path: string): Promise<T | null> {
  const cfg = getBitbucketConfig();
  const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
  const url = `https://api.bitbucket.org/2.0/repositories/${cfg.workspace}/${repoSlug}${path}`;

  trackOutboundCall("bitbucket");
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

function normalisePipelineState(pipeline: BbPipeline): "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED" {
  const stateName = pipeline.state?.name?.toUpperCase() ?? "";
  const resultName = pipeline.state?.result?.name?.toUpperCase() ?? "";
  if (stateName === "COMPLETED") {
    if (resultName === "SUCCESSFUL") return "SUCCESSFUL";
    if (resultName === "FAILED" || resultName === "ERROR") return "FAILED";
    if (resultName === "STOPPED") return "STOPPED";
  }
  return "IN_PROGRESS";
}

function shortRepoName(slug: string): string {
  return slug.replace(/^valk-/, "");
}

export interface PipelineRunPayload {
  id: string;
  repo: string;
  buildNumber: number;
  branchName: string;
  ticketKey: string | null;
  state: "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED";
  durationSeconds: number | null;
  pipelineUrl: string;
  isDeployment: boolean;
  environment: string | null;
  environmentType: "Production" | "Staging" | "Test" | null;
  createdAt: string;
  completedAt: string | null;
}

// GET /api/pipelines - fetch and persist pipeline runs from all repos
export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo");
  const ticketKey = url.searchParams.get("ticketKey");
  const sprintTickets = url.searchParams.get("sprintTickets");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  // Check cache for the full pipeline sync result
  const cacheKey = "/api/pipelines:synced";
  const lastSync = cache.get<number>(cacheKey);
  const now = Date.now();

  // If no recent sync, fetch fresh data from Bitbucket and persist
  if (!lastSync && isConfigured()) {
    try {
      await syncPipelineRuns();
      cache.set(cacheKey, now, 30_000);
    } catch (err) {
      console.error("Pipeline sync failed:", err);
    }
  }

  // Query persisted data from DB with filters
  const conditions = [];
  if (repo) {
    conditions.push(eq(pipelineRun.repo, repo));
  }
  if (ticketKey) {
    conditions.push(eq(pipelineRun.ticketKey, ticketKey));
  }
  if (sprintTickets) {
    const keys = sprintTickets.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      conditions.push(inArray(pipelineRun.ticketKey, keys));
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

  // Check if any runs are currently in progress
  const hasRunning = rows.some((r) => r.state === "IN_PROGRESS");

  const runs: PipelineRunPayload[] = rows.map((r) => ({
    id: r.id,
    repo: r.repo,
    buildNumber: r.buildNumber,
    branchName: r.branchName,
    ticketKey: r.ticketKey,
    state: r.state as PipelineRunPayload["state"],
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
  if (!isConfigured()) {
    return NextResponse.json({ error: "Bitbucket not configured" }, { status: 400 });
  }

  try {
    const result = await syncPipelineRuns();
    cache.set("/api/pipelines:synced", Date.now(), 30_000);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Pipeline sync failed:", err);
    return NextResponse.json({ error: "Pipeline sync failed" }, { status: 500 });
  }
}

// Fetches recent pipelines from all Bitbucket repos and persists them
async function syncPipelineRuns() {
  const cfg = getBitbucketConfig();
  let newRuns = 0;
  let updatedRuns = 0;
  const stateChanges: Array<{ run: typeof pipelineRun.$inferSelect; oldState: string }> = [];

  const allRepoResults = await Promise.all(
    cfg.repoSlugs.map(async (repoSlug) => {
      const res = await bbFetch<BbPaginatedResponse<BbPipeline>>(
        repoSlug,
        `/pipelines?sort=-created_on&pagelen=25`,
      );
      return { repoSlug, pipelines: res?.values ?? [] };
    }),
  );

  for (const { repoSlug, pipelines } of allRepoResults) {
    for (const p of pipelines) {
      const id = `${repoSlug}:${p.build_number}`;
      const state = normalisePipelineState(p);
      const branchName = p.target?.ref_name ?? "";
      const ticketKey = extractTicketKey(branchName);
      const pipelineUrl = p.links?.html?.href ?? "";

      const existing = db
        .select()
        .from(pipelineRun)
        .where(eq(pipelineRun.id, id))
        .get();

      if (existing) {
        if (existing.state !== state) {
          stateChanges.push({ run: existing, oldState: existing.state });
          db.update(pipelineRun)
            .set({
              state,
              previousState: existing.state,
              completedAt: p.completed_on ?? null,
              durationSeconds: p.duration_in_seconds ?? null,
            })
            .where(eq(pipelineRun.id, id))
            .run();
          updatedRuns++;
        }
      } else {
        // Detect deployments by checking pipeline steps
        let isDeployment = false;
        let environment: string | null = null;
        let environmentType: "Production" | "Staging" | "Test" | null = null;

        if (state !== "IN_PROGRESS") {
          const stepsRes = await bbFetch<BbPaginatedResponse<BbPipelineStep>>(
            repoSlug,
            `/pipelines/${p.build_number}/steps?pagelen=25`,
          );
          let detectedEnv: { environment: string; type: "Production" | "Staging" | "Test" } | null = null;
          for (const step of stepsRes?.values ?? []) {
            const envFromStep = detectEnvironment(step.name);
            if (envFromStep) detectedEnv = envFromStep;
            if (step.name.toLowerCase().includes("deploy") && !step.name.toLowerCase().includes("set build") && detectedEnv) {
              isDeployment = true;
              environment = detectedEnv.environment;
              environmentType = detectedEnv.type;
              break;
            }
          }
        }

        db.insert(pipelineRun)
          .values({
            id,
            repo: shortRepoName(repoSlug),
            buildNumber: p.build_number,
            branchName,
            ticketKey,
            state,
            durationSeconds: p.duration_in_seconds ?? null,
            pipelineUrl,
            isDeployment,
            environment,
            environmentType,
            createdAt: p.created_on ?? new Date().toISOString(),
            completedAt: p.completed_on ?? null,
          })
          .run();
        newRuns++;
      }
    }
  }

  // Generate notifications for state changes on followed tickets
  if (stateChanges.length > 0) {
    await generateNotifications(stateChanges);
  }

  return { newRuns, updatedRuns, stateChanges: stateChanges.length };
}

async function generateNotifications(
  stateChanges: Array<{ run: typeof pipelineRun.$inferSelect; oldState: string }>,
) {
  const followed = db.select().from(followedTicket).all();
  const followedKeys = new Set(followed.map((f) => f.ticketKey));

  for (const { run, oldState } of stateChanges) {
    if (!run.ticketKey || !followedKeys.has(run.ticketKey)) continue;

    const finalState = run.state;
    if (oldState === "IN_PROGRESS" && (finalState === "SUCCESSFUL" || finalState === "FAILED" || finalState === "STOPPED")) {
      const stateLabel = finalState === "SUCCESSFUL" ? "completed" : finalState.toLowerCase();
      const message = run.isDeployment
        ? `Deployment to ${run.environment} ${stateLabel} for ${run.ticketKey}`
        : `Pipeline #${run.buildNumber} ${stateLabel} for ${run.ticketKey}`;

      db.insert(alert)
        .values({
          id: randomUUID(),
          type: run.isDeployment ? "deployment" : "pipeline",
          jiraKey: run.ticketKey,
          message,
          createdAt: new Date().toISOString(),
          category: run.isDeployment ? "deployment" : "pipeline",
          linkUrl: run.pipelineUrl,
        })
        .run();
    }
  }
}
