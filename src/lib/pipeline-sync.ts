import "server-only";
import { db } from "@/db";
import { pipelineRun, alert, ticketMetadata, appSetting } from "@/db/schema";
import { env } from "@/lib/env";
import { trackOutboundCall } from "@/lib/rate-limiter";
import { createNotification, isTicketFollowed } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { eq, and, isNull, isNotNull, gte, inArray } from "drizzle-orm";

// -- Environment detection --

const ENV_PATTERNS: Array<{ pattern: RegExp; environment: string; type: "Production" | "Staging" | "Test" }> = [
  { pattern: /prod(uction)?/i, environment: "Production", type: "Production" },
  // Tolerate space/hyphen/underscore separators (e.g. "uat-2", "uat_3", "uat 1")
  { pattern: /uat[\s_-]*3/i, environment: "UAT3", type: "Staging" },
  { pattern: /uat[\s_-]*2/i, environment: "UAT2", type: "Staging" },
  { pattern: /uat[\s_-]*1/i, environment: "UAT1", type: "Staging" },
  { pattern: /staging/i, environment: "Staging", type: "Staging" },
  { pattern: /test/i, environment: "Test", type: "Test" },
];

function detectEnvironment(stepName: string): { environment: string; type: "Production" | "Staging" | "Test" } | null {
  for (const ep of ENV_PATTERNS) {
    if (ep.pattern.test(stepName)) return { environment: ep.environment, type: ep.type };
  }
  return null;
}

/**
 * Pure deployment classifier: given a pipeline's steps, return the deployment
 * environment if any step is a deploy step matching an environment pattern.
 * Single source of truth for the deploy-step heuristic; no I/O so it is unit-testable.
 */
export function classifyStepsForDeployment(
  steps: Array<{ name: string }>,
): { environment: string; type: "Production" | "Staging" | "Test" } | null {
  let detectedEnv: { environment: string; type: "Production" | "Staging" | "Test" } | null = null;
  for (const step of steps) {
    const envFromStep = detectEnvironment(step.name);
    if (envFromStep) detectedEnv = envFromStep;
    const lower = step.name.toLowerCase();
    if (lower.includes("deploy") && !lower.includes("set build") && detectedEnv) {
      return detectedEnv;
    }
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
      logger.info("pipeline-sync", `bbFetch ${res.status} for ${path} on ${repoSlug}`);
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

// -- Deployment detection (shared, idempotent) --

const DEPLOY_CONCURRENCY = 5;

/** Bounded-concurrency map: runs at most `limit` tasks at once, preserves order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

type DeployClassifyResult = "flagged" | "not-deployment" | "transient-error";

/**
 * Classify a single run as a deployment by fetching its steps. Idempotent: skips
 * runs already flagged (no fetch). Only ever writes isDeployment=true, never false,
 * so a transient failure (HTTP error or network throw) leaves the run re-scannable
 * by the backfill pass next cycle rather than being permanently misclassified.
 */
export async function classifyRunDeployment(repoSlug: string, buildNumber: number, id: string): Promise<DeployClassifyResult> {
  const existing = db.select().from(pipelineRun).where(eq(pipelineRun.id, id)).get();
  if (existing?.isDeployment) return "flagged";

  const path = `/pipelines/${buildNumber}/steps?pagelen=25`;
  let stepsRes: BbPaginatedResponse<BbPipelineStep> | null;
  try {
    stepsRes = await bbFetch<BbPaginatedResponse<BbPipelineStep>>(repoSlug, path);
  } catch {
    // Single in-cycle retry on a network throw before deferring to the backfill safety net.
    try {
      stepsRes = await bbFetch<BbPaginatedResponse<BbPipelineStep>>(repoSlug, path);
    } catch {
      return "transient-error";
    }
  }
  // bbFetch returns null on HTTP error (incl. 429 rate-limit); treat as transient so backfill
  // retries (deployCheckedAt is left null, keeping the run eligible for a future scan).
  if (!stepsRes) return "transient-error";

  const now = new Date().toISOString();
  const detectedEnv = classifyStepsForDeployment(stepsRes.values ?? []);
  if (!detectedEnv) {
    // Completed-pipeline steps are immutable: mark as scanned so the backfill advances
    // past it instead of re-fetching the same runs every cycle.
    db.update(pipelineRun).set({ deployCheckedAt: now }).where(eq(pipelineRun.id, id)).run();
    return "not-deployment";
  }

  db.update(pipelineRun)
    .set({ isDeployment: true, environment: detectedEnv.environment, environmentType: detectedEnv.type, deployCheckedAt: now })
    .where(eq(pipelineRun.id, id))
    .run();
  return "flagged";
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
    const mergeInfo = extractMergeInfo(commitMsg);
    let primaryKey = extractTicketKey(branchName);
    const allKeys: string[] = [];
    if (primaryKey) allKeys.push(primaryKey);
    for (const k of extractAllTicketKeys(commitMsg)) {
      if (!allKeys.includes(k)) allKeys.push(k);
    }
    if (mergeInfo.sourceBranch) {
      const sbKey = extractTicketKey(mergeInfo.sourceBranch);
      if (sbKey && !allKeys.includes(sbKey)) allKeys.push(sbKey);
    }
    if (!primaryKey && allKeys.length > 0) primaryKey = allKeys[0];

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

  logger.info("pipeline-sync", `backfill: enriched ${enriched}/${rows.length} rows`);

  // Second pass: re-extract ticket keys from rows that have commit_message but no ticket_key
  const needsReExtraction = db
    .select()
    .from(pipelineRun)
    .where(and(
      isNull(pipelineRun.ticketKey),
      isNotNull(pipelineRun.commitMessage),
    ))
    .limit(BACKFILL_BATCH)
    .all()
    .filter((r) => r.commitMessage && r.commitMessage !== "");

  for (const row of needsReExtraction) {
    const branchName = row.branchName ?? "";
    const msg = row.commitMessage ?? "";
    const mergeInfo = extractMergeInfo(msg);
    let primaryKey = extractTicketKey(branchName);
    const allKeys: string[] = [];
    if (primaryKey) allKeys.push(primaryKey);
    for (const k of extractAllTicketKeys(msg)) {
      if (!allKeys.includes(k)) allKeys.push(k);
    }
    if (mergeInfo.sourceBranch) {
      const sbKey = extractTicketKey(mergeInfo.sourceBranch);
      if (sbKey && !allKeys.includes(sbKey)) allKeys.push(sbKey);
    }
    if (!primaryKey && allKeys.length > 0) primaryKey = allKeys[0];

    if (primaryKey) {
      db.update(pipelineRun)
        .set({
          ticketKey: primaryKey,
          ...(allKeys.length > 1 ? { ticketKeys: JSON.stringify(allKeys) } : {}),
          ...(mergeInfo.sourceBranch && !row.sourceBranch ? { sourceBranch: mergeInfo.sourceBranch } : {}),
        })
        .where(eq(pipelineRun.id, row.id))
        .run();
    }
  }

  if (needsReExtraction.length > 0) {
    logger.info("pipeline-sync", `re-extraction: checked ${needsReExtraction.length} rows`);
  }

  return rows.length + needsReExtraction.length;
}

// -- Main sync --

export interface SyncResult {
  newRuns: number;
  updatedRuns: number;
  stateChanges: number;
  remaining: number;
  backfilled: number;
  backfilledDeployments: number;
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
    return { newRuns: 0, updatedRuns: 0, stateChanges: 0, remaining: 0, backfilled: 0, backfilledDeployments: 0 };
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
    await runDeployDetectionForStateChanges(stateChanges);
    processStateChanges(stateChanges);
    const backfilled = await backfillEnrichment();
    const backfilledDeployments = await backfillDeploymentDetection();
    return { newRuns: 0, updatedRuns, stateChanges: stateChanges.length, remaining: 0, backfilled, backfilledDeployments };
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
    const mergeInfo = msg ? extractMergeInfo(msg) : { sourceBranch: null, prNumber: null };
    let primaryKey = extractTicketKey(branchName);
    const allKeys: string[] = [];
    if (primaryKey) allKeys.push(primaryKey);
    if (msg) for (const k of extractAllTicketKeys(msg)) if (!allKeys.includes(k)) allKeys.push(k);
    // Fallback: extract from sourceBranch when direct branch/message extraction missed it
    if (mergeInfo.sourceBranch) {
      const sbKey = extractTicketKey(mergeInfo.sourceBranch);
      if (sbKey && !allKeys.includes(sbKey)) allKeys.push(sbKey);
    }
    if (!primaryKey && allKeys.length > 0) primaryKey = allKeys[0];
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
  const prCandidates: PrCandidate[] = [];
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
      if (pr.url && pr.title) {
        prCandidates.push({ prUrl: pr.url, prTitle: pr.title, ticketKey: rd.ticketKey, isMerge: !!rd.sourceBranch, eventAt: p.created_on ?? new Date().toISOString() });
      }
    }

    // Advance watermark after each pipeline (oldest-first order)
    if (p.created_on) setWatermark(p.created_on);
  }

  // Deployment detection for newly inserted completed runs. No per-cycle cap: all
  // candidates are processed under bounded concurrency so none are silently dropped.
  if (pendingDeployDetection.length > 0) {
    await mapWithConcurrency(pendingDeployDetection, DEPLOY_CONCURRENCY, ({ repoSlug, buildNumber, id }) =>
      classifyRunDeployment(repoSlug, buildNumber, id),
    );
  }

  await runDeployDetectionForStateChanges(stateChanges);
  processPRNotifications(prCandidates);
  processStateChanges(stateChanges);

  // Run enrichment backfill for existing rows missing commit data
  const backfilled = await backfillEnrichment();
  const backfilledDeployments = await backfillDeploymentDetection();

  return { newRuns, updatedRuns, stateChanges: stateChanges.length, remaining: totalRemaining, backfilled, backfilledDeployments };
}

// -- State change processing --

interface PrCandidate {
  prUrl: string;
  prTitle: string;
  ticketKey: string | null;
  isMerge: boolean;
  eventAt: string;
}

type StateChangeEntry = { run: typeof pipelineRun.$inferSelect; oldState: string };

// Pipelines that go from IN_PROGRESS → completed transition through the existing-pipeline
// code path, which never queues deployment detection. This function fills that gap by
// fetching steps for unchecked transitions and updating the DB before notifications fire.
async function runDeployDetectionForStateChanges(stateChanges: StateChangeEntry[]): Promise<void> {
  const candidates = stateChanges.filter(
    ({ run, oldState }) =>
      oldState === "IN_PROGRESS" &&
      !run.isDeployment &&
      (run.state === "SUCCESSFUL" || run.state === "FAILED" || run.state === "STOPPED"),
  );
  if (candidates.length === 0) return;

  // No per-cycle cap: all transitions are processed under bounded concurrency.
  await mapWithConcurrency(candidates, DEPLOY_CONCURRENCY, async (sc) => {
    const result = await classifyRunDeployment(fullRepoSlug(sc.run.repo), sc.run.buildNumber, sc.run.id);
    if (result === "flagged") {
      // Refresh the run object in place so processStateChanges sees the updated values.
      const updated = db.select().from(pipelineRun).where(eq(pipelineRun.id, sc.run.id)).get();
      if (updated) sc.run = updated;
    }
  });
}

// -- Periodic deployment-detection backfill --

const DEPLOY_BACKFILL_BATCH = 20;
const DEPLOY_BACKFILL_DAYS = 14;
// Per-tick drain cap. Each scanned run is one Bitbucket steps call; at 12 ticks/hour this
// stays well under the 1000 req/hour budget while clearing a backlog over a few ticks.
const DEPLOY_BACKFILL_MAX_PER_TICK = 60;
const COMPLETED_STATES = ["SUCCESSFUL", "FAILED", "STOPPED"] as const;

/**
 * Re-scans recent completed runs that have not yet been deploy-checked and classifies any
 * that are deployments. Bounded by a time window (last N days), a per-batch size, and a
 * per-tick cap to respect Bitbucket rate limits. The deployCheckedAt marker guarantees
 * forward progress: each scanned non-deployment run is stamped and excluded from future
 * batches, so the backfill walks through the whole window instead of re-scanning the same
 * rows. Transient fetch errors leave the marker null, so those runs are retried next tick.
 * Idempotent: already-flagged or already-checked runs are excluded by the WHERE clause.
 */
export async function backfillDeploymentDetection(): Promise<number> {
  if (!isPipelineConfigured()) return 0;

  const cutoff = new Date(Date.now() - DEPLOY_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let totalFlagged = 0;
  let totalScanned = 0;

  while (totalScanned < DEPLOY_BACKFILL_MAX_PER_TICK) {
    const rows = db
      .select()
      .from(pipelineRun)
      .where(and(
        eq(pipelineRun.isDeployment, false),
        isNull(pipelineRun.deployCheckedAt),
        inArray(pipelineRun.state, [...COMPLETED_STATES]),
        gte(pipelineRun.createdAt, cutoff),
      ))
      .limit(DEPLOY_BACKFILL_BATCH)
      .all();

    if (rows.length === 0) break;

    const results = await mapWithConcurrency(rows, DEPLOY_CONCURRENCY, (r) =>
      classifyRunDeployment(fullRepoSlug(r.repo), r.buildNumber, r.id),
    );

    totalFlagged += results.filter((r) => r === "flagged").length;
    totalScanned += rows.length;

    // A transient error leaves the marker null; stop this tick rather than spinning on
    // the same unmarked rows (they are retried next tick).
    if (results.some((r) => r === "transient-error")) break;
  }

  if (totalFlagged > 0) {
    logger.info("pipeline-sync", `deploy backfill: flagged ${totalFlagged} of ${totalScanned} scanned runs`);
  }
  return totalFlagged;
}

export function processStateChanges(stateChanges: StateChangeEntry[]) {
  if (stateChanges.length === 0) return;

  for (const { run, oldState } of stateChanges) {
    const finalState = run.state;
    if (oldState !== "IN_PROGRESS" || (finalState !== "SUCCESSFUL" && finalState !== "FAILED" && finalState !== "STOPPED")) continue;

    if (run.ticketKey) {
      db.update(ticketMetadata)
        .set({ testStatus: finalState === "SUCCESSFUL" ? "pass" : "fail", lastTestRunAt: new Date().toISOString(), lastTestReportUrl: run.pipelineUrl })
        .where(eq(ticketMetadata.jiraKey, run.ticketKey))
        .run();
    }

    const eventAt = run.completedAt ?? run.createdAt;
    if (run.isDeployment) {
      if (!run.ticketKey || !run.environment) continue;
      // Non-production deployments require an explicit follow (ticket or sprint).
      // Production always notifies.
      if (run.environmentType !== "Production" && !isTicketFollowed(run.ticketKey, true)) continue;
      const message = finalState === "SUCCESSFUL"
        ? `Deployed ${run.ticketKey} to ${run.environment}`
        : `Deployment to ${run.environment} failed for ${run.ticketKey}`;
      createNotification("deployment", message, { category: "deployment", jiraKey: run.ticketKey, linkUrl: run.pipelineUrl ?? undefined, eventAt, skipFollowCheck: true });
    } else {
      // Only notify on failures — successful pipeline completions are too noisy
      if (finalState === "SUCCESSFUL") continue;
      const subject = run.ticketKey ? `for ${run.ticketKey}` : `on ${run.branchName ?? "unknown branch"}`;
      createNotification("pipeline", `Pipeline #${run.buildNumber} failed ${subject}`, {
        category: "pipeline",
        jiraKey: run.ticketKey ?? undefined,
        linkUrl: run.pipelineUrl ?? undefined,
        eventAt,
      });
    }
  }
}

export function processPRNotifications(candidates: PrCandidate[]) {
  if (candidates.length === 0) return;

  for (const { prUrl, prTitle, ticketKey, isMerge, eventAt } of candidates) {
    // "PR opened" is handled by syncPullRequests() which polls the PR API directly,
    // so we only create "PR merged" here (detected via merge commit pipelines).
    if (isMerge) {
      const mergedLinkUrl = `${prUrl}#merged`;
      const mergedExists = db.select({ id: alert.id })
        .from(alert)
        .where(and(eq(alert.linkUrl, mergedLinkUrl), eq(alert.category, "pr")))
        .get();
      if (!mergedExists) {
        createNotification("pr", `PR merged: ${prTitle}`, {
          category: "pr",
          jiraKey: ticketKey ?? undefined,
          linkUrl: mergedLinkUrl,
          eventAt,
        });
      }
    }
  }
}

// -- Direct PR sync (polls Bitbucket PR API for open + recently merged PRs) --

const PR_SYNC_WATERMARK_KEY = "pr_sync:watermark";

function getPrSyncWatermark(): string | null {
  return db.select().from(appSetting).where(eq(appSetting.key, PR_SYNC_WATERMARK_KEY)).get()?.value ?? null;
}

function setPrSyncWatermark(value: string) {
  const existing = db.select().from(appSetting).where(eq(appSetting.key, PR_SYNC_WATERMARK_KEY)).get();
  if (existing) {
    db.update(appSetting).set({ value }).where(eq(appSetting.key, PR_SYNC_WATERMARK_KEY)).run();
  } else {
    db.insert(appSetting).values({ key: PR_SYNC_WATERMARK_KEY, value }).run();
  }
}

interface BbPullRequest {
  id: number;
  title: string;
  state: string;
  created_on: string;
  updated_on: string;
  author?: { display_name?: string };
  source?: { branch?: { name: string } };
  destination?: { branch?: { name: string } };
  links?: { html?: { href: string } };
}

export interface PrSyncResult {
  newOpened: number;
  newMerged: number;
}

/**
 * Poll Bitbucket PR API to detect PRs when they are opened (not only when merged).
 * Creates "PR opened" notifications for newly seen open PRs and "PR merged"
 * notifications for recently merged PRs. Deduplicates against existing alerts.
 */
export async function syncPullRequests(): Promise<PrSyncResult> {
  if (!isPipelineConfigured()) {
    return { newOpened: 0, newMerged: 0 };
  }

  const cfg = getBitbucketConfig();
  const watermark = getPrSyncWatermark();
  let newOpened = 0;
  let newMerged = 0;
  let newestTimestamp = watermark;

  const repoResults = await Promise.all(
    cfg.repoSlugs.map(async (repoSlug) => {
      const [openPrs, mergedPrs] = await Promise.all([
        bbFetch<BbPaginatedResponse<BbPullRequest>>(repoSlug, `/pullrequests?state=OPEN&pagelen=50`),
        bbFetch<BbPaginatedResponse<BbPullRequest>>(repoSlug, `/pullrequests?state=MERGED&sort=-updated_on&pagelen=10`),
      ]);
      return { repoSlug, openPrs: openPrs?.values ?? [], mergedPrs: mergedPrs?.values ?? [] };
    }),
  );

  for (const { openPrs, mergedPrs } of repoResults) {
    for (const pr of openPrs) {
      const prUrl = pr.links?.html?.href;
      if (!prUrl || !pr.title) continue;
      // Skip PRs created before the watermark
      if (watermark && pr.created_on && pr.created_on <= watermark) continue;

      const exists = db.select({ id: alert.id })
        .from(alert)
        .where(and(eq(alert.linkUrl, prUrl), eq(alert.category, "pr")))
        .get();

      if (!exists) {
        const ticketKey = extractTicketKey(pr.source?.branch?.name ?? "") ?? extractTicketKey(pr.title);
        createNotification("pr", `PR opened: ${pr.title}`, {
          category: "pr",
          jiraKey: ticketKey ?? undefined,
          linkUrl: prUrl,
          eventAt: pr.created_on,
        });
        newOpened++;
      }

      if (pr.created_on && (!newestTimestamp || pr.created_on > newestTimestamp)) {
        newestTimestamp = pr.created_on;
      }
    }

    for (const pr of mergedPrs) {
      const prUrl = pr.links?.html?.href;
      if (!prUrl || !pr.title) continue;
      // Skip PRs merged before the watermark
      if (watermark && pr.updated_on && pr.updated_on <= watermark) continue;

      const mergedLinkUrl = `${prUrl}#merged`;
      const exists = db.select({ id: alert.id })
        .from(alert)
        .where(and(eq(alert.linkUrl, mergedLinkUrl), eq(alert.category, "pr")))
        .get();

      if (!exists) {
        const ticketKey = extractTicketKey(pr.source?.branch?.name ?? "") ?? extractTicketKey(pr.title);
        createNotification("pr", `PR merged: ${pr.title}`, {
          category: "pr",
          jiraKey: ticketKey ?? undefined,
          linkUrl: mergedLinkUrl,
          eventAt: pr.updated_on,
        });
        newMerged++;
      }

      if (pr.updated_on && (!newestTimestamp || pr.updated_on > newestTimestamp)) {
        newestTimestamp = pr.updated_on;
      }
    }
  }

  // On first run (no watermark), set watermark to now so only future PRs are notified
  if (!watermark) {
    setPrSyncWatermark(new Date().toISOString());
  } else if (newestTimestamp && newestTimestamp > watermark) {
    setPrSyncWatermark(newestTimestamp);
  }

  return { newOpened, newMerged };
}
