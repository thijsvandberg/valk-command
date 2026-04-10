import "server-only";
import { db } from "@/db";
import { pipelineRun, alert, followedTicket, ticketMetadata, appSetting } from "@/db/schema";
import { env } from "@/lib/env";
import { trackOutboundCall } from "@/lib/rate-limiter";
import { eq, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";

// -- Environment detection --

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

// -- Ticket key extraction --

const TICKET_KEY_REGEX = /([A-Z][A-Z0-9]+-\d+)/;
const TICKET_KEY_REGEX_G = /([A-Z][A-Z0-9]+-\d+)/g;
const MERGE_BRANCH_REGEX = /Merged in ([^\s(]+)/i;
const MERGE_PR_REGEX = /\(pull request #(\d+)\)/i;

function extractTicketKey(text: string): string | null {
  return text.match(TICKET_KEY_REGEX)?.[1] ?? null;
}

function extractAllTicketKeys(text: string): string[] {
  const matches = text.match(TICKET_KEY_REGEX_G);
  return matches ? [...new Set(matches)] : [];
}

function extractMergeInfo(msg: string) {
  return {
    sourceBranch: msg.match(MERGE_BRANCH_REGEX)?.[1] ?? null,
    prNumber: msg.match(MERGE_PR_REGEX)?.[1] ? parseInt(msg.match(MERGE_PR_REGEX)![1], 10) : null,
  };
}

// -- Bitbucket config & fetch --

function getBitbucketConfig() {
  const repoSlugs = env.BITBUCKET_REPO_SLUG.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    workspace: env.BITBUCKET_WORKSPACE,
    repoSlugs,
    email: env.BITBUCKET_EMAIL || env.JIRA_EMAIL,
    token: env.BITBUCKET_APP_PASSWORD || env.BITBUCKET_API_TOKEN,
  };
}

export function isPipelineConfigured() {
  const cfg = getBitbucketConfig();
  return Boolean(cfg.workspace && cfg.repoSlugs.length > 0 && cfg.email && cfg.token);
}

interface BbPipelineStep { uuid: string; name: string; state?: { name: string; result?: { name: string } }; completed_on?: string }
interface BbPipeline {
  uuid: string;
  build_number: number;
  state?: { name: string; result?: { name: string }; stage?: { name: string } };
  created_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  creator?: { display_name?: string; nickname?: string };
  target?: { ref_name?: string; ref_type?: string; selector?: { type: string }; commit?: { hash?: string; message?: string } };
  links?: { html?: { href: string } };
}
interface BbPaginatedResponse<T> { values: T[]; next?: string }

function bbAuthHeaders() {
  const cfg = getBitbucketConfig();
  const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
  return { Authorization: `Basic ${auth}`, Accept: "application/json" };
}

async function bbFetch<T>(repoSlug: string, path: string, silent404 = false): Promise<T | null> {
  const cfg = getBitbucketConfig();
  const url = `https://api.bitbucket.org/2.0/repositories/${cfg.workspace}/${repoSlug}${path}`;
  trackOutboundCall("bitbucket");
  const res = await fetch(url, { redirect: "follow", headers: bbAuthHeaders() });
  if (!res.ok) {
    if (!(silent404 && res.status === 404)) {
      console.log(`[pipeline-sync] bbFetch ${res.status} for ${path} on ${repoSlug}`);
    }
    return null;
  }
  return res.json() as Promise<T>;
}

async function bbFetchUrl<T>(url: string): Promise<T | null> {
  trackOutboundCall("bitbucket");
  const res = await fetch(url, { redirect: "follow", headers: bbAuthHeaders() });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

function normalisePipelineState(p: BbPipeline): "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED" | "PAUSED" {
  const s = p.state?.name?.toUpperCase() ?? "";
  const r = p.state?.result?.name?.toUpperCase() ?? "";
  const st = p.state?.stage?.name?.toUpperCase() ?? "";
  if (s === "COMPLETED") {
    if (r === "SUCCESSFUL") return "SUCCESSFUL";
    if (r === "FAILED" || r === "ERROR") return "FAILED";
    if (r === "STOPPED") return "STOPPED";
  }
  if (s === "PAUSED" || s === "HALTED") return "PAUSED";
  if (s === "IN_PROGRESS" && st === "PAUSED") return "PAUSED";
  return "IN_PROGRESS";
}

function shortRepoName(slug: string): string { return slug.replace(/^valk-/, ""); }

// -- Watermark: same pattern as Jira sync --

const WATERMARK_KEY = "pipeline_sync:watermark";
const PAGE_SIZE = 50;

function getWatermark(): string | null {
  return db.select().from(appSetting).where(eq(appSetting.key, WATERMARK_KEY)).get()?.value ?? null;
}

function setWatermark(value: string) {
  const existing = db.select().from(appSetting).where(eq(appSetting.key, WATERMARK_KEY)).get();
  if (existing) {
    db.update(appSetting).set({ value }).where(eq(appSetting.key, WATERMARK_KEY)).run();
  } else {
    db.insert(appSetting).values({ key: WATERMARK_KEY, value }).run();
  }
}

// -- Enrichment backfill for existing rows missing commit data --

const BACKFILL_BATCH = 20;

function fullRepoSlug(shortName: string): string {
  return `valk-${shortName}`;
}

/**
 * Picks up existing pipeline_run rows without a commit_message,
 * fetches their commit from Bitbucket, and re-extracts ticket keys.
 * Runs a small batch per sync call until all rows are enriched.
 */
export async function backfillEnrichment(): Promise<number> {
  if (!isPipelineConfigured()) return 0;

  const rows = db
    .select()
    .from(pipelineRun)
    .where(isNull(pipelineRun.commitMessage))
    .limit(BACKFILL_BATCH)
    .all();

  if (rows.length === 0) return 0;

  // Fetch commits in parallel
  const commitResults = await Promise.all(
    rows.map((r) => {
      // The pipeline URL contains the commit hash indirectly, but we need to
      // fetch the pipeline to get the commit hash. Use the pipeline API instead.
      const repoSlug = fullRepoSlug(r.repo);
      return bbFetch<BbPipeline>(repoSlug, `/pipelines/${r.buildNumber}`, true);
    }),
  );

  let enriched = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pipeline = commitResults[i];
    if (!pipeline) continue;

    const commitHash = pipeline.target?.commit?.hash;
    let commitMsg = pipeline.target?.commit?.message ?? null;

    // If no inline message, fetch commit directly (silent 404 for deleted commits)
    if (!commitMsg && commitHash) {
      const commitRes = await bbFetch<{ message?: string }>(fullRepoSlug(row.repo), `/commit/${commitHash}`, true);
      commitMsg = commitRes?.message ?? null;
    }

    if (!commitMsg) {
      // Mark as checked so we don't re-fetch (store empty string)
      db.update(pipelineRun)
        .set({ commitMessage: "" })
        .where(eq(pipelineRun.id, row.id))
        .run();
      continue;
    }

    const firstLine = commitMsg.split("\n")[0].substring(0, 200);

    // Re-extract ticket keys
    const branchName = row.branchName ?? "";
    let primaryKey = extractTicketKey(branchName);
    const allKeys: string[] = [];
    if (primaryKey) allKeys.push(primaryKey);
    for (const k of extractAllTicketKeys(commitMsg)) {
      if (!allKeys.includes(k)) allKeys.push(k);
    }
    if (!primaryKey && allKeys.length > 0) primaryKey = allKeys[0];

    const mergeInfo = extractMergeInfo(commitMsg);

    db.update(pipelineRun)
      .set({
        commitMessage: firstLine,
        ...(primaryKey && !row.ticketKey ? { ticketKey: primaryKey } : {}),
        ...(allKeys.length > 1 ? { ticketKeys: JSON.stringify(allKeys) } : {}),
        ...(mergeInfo.sourceBranch ? { sourceBranch: mergeInfo.sourceBranch } : {}),
      })
      .where(eq(pipelineRun.id, row.id))
      .run();
    enriched++;
  }

  console.log(`[pipeline-sync] backfill: enriched ${enriched}/${rows.length} rows`);
  return rows.length; // Return batch size so caller knows there might be more
}

// -- Main sync --

export interface SyncResult {
  newRuns: number;
  updatedRuns: number;
  stateChanges: number;
  remaining: number;
  backfilled: number;
}

/**
 * Incremental pipeline sync. Same pattern as Jira sync:
 * - Fetch one page of pipelines (newest first) per repo
 * - Process new/changed ones, skip already-seen
 * - Advance the watermark to the newest created_on
 * - Return remaining count so the caller can invoke again until caught up
 */
export async function syncPipelines(): Promise<SyncResult> {
  if (!isPipelineConfigured()) {
    return { newRuns: 0, updatedRuns: 0, stateChanges: 0, remaining: 0, backfilled: 0 };
  }

  const cfg = getBitbucketConfig();
  const watermark = getWatermark();
  let newRuns = 0;
  let updatedRuns = 0;
  let totalRemaining = 0;
  const stateChanges: Array<{ run: typeof pipelineRun.$inferSelect; oldState: string }> = [];
  const pendingDeployDetection: Array<{ repoSlug: string; buildNumber: number; id: string }> = [];

  // Fetch one page per repo in parallel
  const repoResults = await Promise.all(
    cfg.repoSlugs.map(async (repoSlug) => {
      const res = await bbFetch<BbPaginatedResponse<BbPipeline>>(
        repoSlug,
        `/pipelines?sort=-created_on&pagelen=${PAGE_SIZE}`,
      );
      return { repoSlug, page: res };
    }),
  );

  // Collect all pipelines that are newer than the watermark
  const allNew: Array<{ repoSlug: string; pipeline: BbPipeline }> = [];
  const allExisting: Array<{ repoSlug: string; pipeline: BbPipeline }> = [];

  for (const { repoSlug, page } of repoResults) {
    if (!page) continue;

    for (const p of page.values) {
      const isNew = !watermark || !p.created_on || p.created_on > watermark;
      if (isNew) {
        allNew.push({ repoSlug, pipeline: p });
      } else {
        allExisting.push({ repoSlug, pipeline: p });
      }
    }

    // If we got a full page and the oldest item is still newer than watermark,
    // there are more unseen pipelines behind it
    if (page.next && watermark) {
      const oldest = page.values[page.values.length - 1];
      if (oldest?.created_on && oldest.created_on > watermark) {
        totalRemaining++;
      }
    }
  }

  // Also check existing pipelines for state changes (IN_PROGRESS -> completed)
  for (const { repoSlug, pipeline: p } of allExisting) {
    const id = `${repoSlug}:${p.build_number}`;
    const state = normalisePipelineState(p);
    const creator = p.creator?.display_name ?? p.creator?.nickname ?? null;
    const existing = db.select().from(pipelineRun).where(eq(pipelineRun.id, id)).get();
    if (existing && existing.state !== state) {
      stateChanges.push({ run: existing, oldState: existing.state });
      db.update(pipelineRun)
        .set({
          state,
          previousState: existing.state,
          completedAt: p.completed_on ?? null,
          durationSeconds: p.duration_in_seconds ?? null,
          ...(creator && !existing.creator ? { creator } : {}),
        })
        .where(eq(pipelineRun.id, id))
        .run();
      updatedRuns++;
    }
  }

  if (allNew.length === 0) {
    processStateChanges(stateChanges);
    const backfilled = await backfillEnrichment();
    return { newRuns: 0, updatedRuns, stateChanges: stateChanges.length, remaining: 0, backfilled };
  }

  // Batch commit lookups for new pipelines
  const needsCommitLookup: Array<{ idx: number; repoSlug: string; hash: string }> = [];
  const commitMessages: (string | null)[] = allNew.map(({ pipeline }, idx) => {
    const branchName = pipeline.target?.ref_name ?? "";
    const key = extractTicketKey(branchName);
    const inlineMsg = pipeline.target?.commit?.message ?? null;
    if (inlineMsg) return inlineMsg;
    if (!key && pipeline.target?.commit?.hash) {
      needsCommitLookup.push({ idx, repoSlug: allNew[idx].repoSlug, hash: pipeline.target.commit.hash });
    }
    return null;
  });

  if (needsCommitLookup.length > 0) {
    const results = await Promise.all(
      needsCommitLookup.map(({ repoSlug, hash }) => bbFetch<{ message?: string }>(repoSlug, `/commit/${hash}`)),
    );
    for (let i = 0; i < needsCommitLookup.length; i++) {
      commitMessages[needsCommitLookup[i].idx] = results[i]?.message ?? null;
    }
  }

  // Resolve enrichment data
  const resolved = allNew.map(({ pipeline: p }, idx) => {
    const branchName = p.target?.ref_name ?? "";
    const msg = commitMessages[idx];
    const firstLine = msg ? msg.split("\n")[0].substring(0, 200) : null;
    let primaryKey = extractTicketKey(branchName);
    const allKeys: string[] = [];
    if (primaryKey) allKeys.push(primaryKey);
    if (msg) for (const k of extractAllTicketKeys(msg)) if (!allKeys.includes(k)) allKeys.push(k);
    if (!primaryKey && allKeys.length > 0) primaryKey = allKeys[0];
    const mergeInfo = msg ? extractMergeInfo(msg) : { sourceBranch: null, prNumber: null };
    return { ticketKey: primaryKey, ticketKeys: allKeys.length > 1 ? allKeys : null, commitMessage: firstLine, ...mergeInfo };
  });

  // Batch PR lookups
  const prLookups: Array<{ idx: number; repoSlug: string; prNumber: number }> = [];
  for (let i = 0; i < resolved.length; i++) {
    if (resolved[i].prNumber) prLookups.push({ idx: i, repoSlug: allNew[i].repoSlug, prNumber: resolved[i].prNumber! });
  }

  interface BbPrBasic { title?: string; author?: { display_name?: string }; links?: { html?: { href: string } } }
  const prData: Array<{ title: string | null; author: string | null; url: string | null }> = resolved.map(() => ({ title: null, author: null, url: null }));

  if (prLookups.length > 0) {
    const prResults = await Promise.all(
      prLookups.map(({ repoSlug, prNumber }) => bbFetch<BbPrBasic>(repoSlug, `/pullrequests/${prNumber}`)),
    );
    for (let i = 0; i < prLookups.length; i++) {
      const pr = prResults[i];
      if (pr) prData[prLookups[i].idx] = { title: pr.title ?? null, author: pr.author?.display_name ?? null, url: pr.links?.html?.href ?? null };
    }
  }

  // Persist and advance watermark (process newest last so watermark advances progressively)
  // Sort oldest-first so we advance the watermark safely
  const sorted = allNew
    .map((entry, idx) => ({ ...entry, idx }))
    .sort((a, b) => (a.pipeline.created_on ?? "").localeCompare(b.pipeline.created_on ?? ""));

  for (const { repoSlug, pipeline: p, idx } of sorted) {
    const id = `${repoSlug}:${p.build_number}`;
    const state = normalisePipelineState(p);
    const branchName = p.target?.ref_name ?? "";
    const rd = resolved[idx];
    const pr = prData[idx];
    const creator = p.creator?.display_name ?? p.creator?.nickname ?? null;
    const pipelineUrl = p.links?.html?.href || `https://bitbucket.org/${cfg.workspace}/${repoSlug}/pipelines/results/${p.build_number}`;

    const existing = db.select().from(pipelineRun).where(eq(pipelineRun.id, id)).get();

    if (existing) {
      const needsCreatorUpdate = !existing.creator && creator;
      const needsEnrichment = !existing.commitMessage && rd.commitMessage;
      if (existing.state !== state || needsCreatorUpdate || needsEnrichment) {
        if (existing.state !== state) stateChanges.push({ run: existing, oldState: existing.state });
        db.update(pipelineRun)
          .set({
            state,
            previousState: existing.state !== state ? existing.state : existing.previousState,
            completedAt: p.completed_on ?? null,
            durationSeconds: p.duration_in_seconds ?? null,
            ...(creator ? { creator } : {}),
            ...(needsEnrichment ? { commitMessage: rd.commitMessage, ticketKeys: rd.ticketKeys ? JSON.stringify(rd.ticketKeys) : null, sourceBranch: rd.sourceBranch, prUrl: pr.url, prTitle: pr.title, prAuthor: pr.author } : {}),
          })
          .where(eq(pipelineRun.id, id))
          .run();
        updatedRuns++;
      }
    } else {
      db.insert(pipelineRun)
        .values({
          id, repo: shortRepoName(repoSlug), buildNumber: p.build_number, branchName,
          ticketKey: rd.ticketKey, ticketKeys: rd.ticketKeys ? JSON.stringify(rd.ticketKeys) : null,
          state, creator, durationSeconds: p.duration_in_seconds ?? null, pipelineUrl,
          isDeployment: false, environment: null, environmentType: null,
          createdAt: p.created_on ?? new Date().toISOString(), completedAt: p.completed_on ?? null,
          commitMessage: rd.commitMessage, sourceBranch: rd.sourceBranch,
          prUrl: pr.url, prTitle: pr.title, prAuthor: pr.author,
        })
        .run();
      newRuns++;
      if (state !== "IN_PROGRESS") pendingDeployDetection.push({ repoSlug, buildNumber: p.build_number, id });
    }

    // Advance watermark after each pipeline (oldest-first order)
    if (p.created_on) setWatermark(p.created_on);
  }

  // Deployment detection (limit to 5 per sync)
  if (pendingDeployDetection.length > 0) {
    await Promise.all(
      pendingDeployDetection.slice(0, 5).map(async ({ repoSlug, buildNumber, id }) => {
        try {
          const stepsRes = await bbFetch<BbPaginatedResponse<BbPipelineStep>>(repoSlug, `/pipelines/${buildNumber}/steps?pagelen=25`);
          let detectedEnv: { environment: string; type: "Production" | "Staging" | "Test" } | null = null;
          for (const step of stepsRes?.values ?? []) {
            const envFromStep = detectEnvironment(step.name);
            if (envFromStep) detectedEnv = envFromStep;
            if (step.name.toLowerCase().includes("deploy") && !step.name.toLowerCase().includes("set build") && detectedEnv) {
              db.update(pipelineRun).set({ isDeployment: true, environment: detectedEnv.environment, environmentType: detectedEnv.type }).where(eq(pipelineRun.id, id)).run();
              break;
            }
          }
        } catch { /* best-effort */ }
      }),
    );
  }

  processStateChanges(stateChanges);

  // Run enrichment backfill for existing rows missing commit data
  const backfilled = await backfillEnrichment();

  return { newRuns, updatedRuns, stateChanges: stateChanges.length, remaining: totalRemaining, backfilled };
}

// -- State change processing --

function processStateChanges(stateChanges: Array<{ run: typeof pipelineRun.$inferSelect; oldState: string }>) {
  if (stateChanges.length === 0) return;
  const followedKeys = new Set(db.select().from(followedTicket).all().map((f) => f.ticketKey));

  for (const { run, oldState } of stateChanges) {
    if (!run.ticketKey) continue;
    const finalState = run.state;
    if (oldState !== "IN_PROGRESS" || (finalState !== "SUCCESSFUL" && finalState !== "FAILED" && finalState !== "STOPPED")) continue;

    db.update(ticketMetadata)
      .set({ testStatus: finalState === "SUCCESSFUL" ? "pass" : "fail", lastTestRunAt: new Date().toISOString(), lastTestReportUrl: run.pipelineUrl })
      .where(eq(ticketMetadata.jiraKey, run.ticketKey))
      .run();

    if (!followedKeys.has(run.ticketKey)) continue;
    const stateLabel = finalState === "SUCCESSFUL" ? "completed" : finalState.toLowerCase();
    const message = run.isDeployment ? `Deployment to ${run.environment} ${stateLabel} for ${run.ticketKey}` : `Pipeline #${run.buildNumber} ${stateLabel} for ${run.ticketKey}`;
    db.insert(alert).values({ id: randomUUID(), type: run.isDeployment ? "deployment" : "pipeline", jiraKey: run.ticketKey, message, createdAt: new Date().toISOString(), category: run.isDeployment ? "deployment" : "pipeline", linkUrl: run.pipelineUrl }).run();
  }
}
