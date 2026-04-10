import "server-only";
import { db } from "@/db";
import { pipelineRun, alert, followedTicket } from "@/db/schema";
import { env } from "@/lib/env";
import { trackOutboundCall } from "@/lib/rate-limiter";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

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
const TICKET_KEY_REGEX_G = /([A-Z][A-Z0-9]+-\d+)/g;

function extractTicketKey(text: string): string | null {
  const match = text.match(TICKET_KEY_REGEX);
  return match ? match[1] : null;
}

function extractAllTicketKeys(text: string): string[] {
  const matches = text.match(TICKET_KEY_REGEX_G);
  if (!matches) return [];
  return [...new Set(matches)];
}

// Extract source branch from merge commit messages like "Merged in feature/VPL-123-foo (pull request #42)"
const MERGE_BRANCH_REGEX = /Merged in ([^\s(]+)/i;
const MERGE_PR_REGEX = /\(pull request #(\d+)\)/i;

function extractMergeInfo(commitMessage: string): { sourceBranch: string | null; prNumber: number | null } {
  const branchMatch = commitMessage.match(MERGE_BRANCH_REGEX);
  const prMatch = commitMessage.match(MERGE_PR_REGEX);
  return {
    sourceBranch: branchMatch ? branchMatch[1] : null,
    prNumber: prMatch ? parseInt(prMatch[1], 10) : null,
  };
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

export function isPipelineConfigured() {
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
  state?: { name: string; result?: { name: string }; stage?: { name: string } };
  created_on?: string;
  completed_on?: string;
  duration_in_seconds?: number;
  creator?: { display_name?: string; nickname?: string };
  target?: {
    ref_name?: string;
    ref_type?: string;
    selector?: { type: string };
    commit?: { hash?: string; message?: string };
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

  if (!res.ok) {
    console.log(`[pipeline-sync] bbFetch ${res.status} for ${path} on ${repoSlug}`);
    return null;
  }
  return res.json() as Promise<T>;
}

function normalisePipelineState(pipeline: BbPipeline): "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED" | "PAUSED" {
  const stateName = pipeline.state?.name?.toUpperCase() ?? "";
  const resultName = pipeline.state?.result?.name?.toUpperCase() ?? "";
  const stageName = pipeline.state?.stage?.name?.toUpperCase() ?? "";
  if (stateName === "COMPLETED") {
    if (resultName === "SUCCESSFUL") return "SUCCESSFUL";
    if (resultName === "FAILED" || resultName === "ERROR") return "FAILED";
    if (resultName === "STOPPED") return "STOPPED";
  }
  if (stateName === "PAUSED" || stateName === "HALTED") return "PAUSED";
  // Bitbucket nests PAUSED inside IN_PROGRESS as stage.name
  if (stateName === "IN_PROGRESS" && stageName === "PAUSED") return "PAUSED";
  return "IN_PROGRESS";
}

function shortRepoName(slug: string): string {
  return slug.replace(/^valk-/, "");
}

export interface SyncResult {
  newRuns: number;
  updatedRuns: number;
  stateChanges: number;
}

/**
 * Fetches recent pipelines from all Bitbucket repos and persists them.
 * Detects deployments and generates notifications for followed tickets.
 */
export async function syncPipelines(): Promise<SyncResult> {
  if (!isPipelineConfigured()) {
    return { newRuns: 0, updatedRuns: 0, stateChanges: 0 };
  }

  const cfg = getBitbucketConfig();
  let newRuns = 0;
  let updatedRuns = 0;
  const stateChanges: Array<{ run: typeof pipelineRun.$inferSelect; oldState: string }> = [];
  const pendingDeployDetection: Array<{ repoSlug: string; buildNumber: number; id: string }> = [];

  const allRepoResults = await Promise.all(
    cfg.repoSlugs.map(async (repoSlug) => {
      const res = await bbFetch<BbPaginatedResponse<BbPipeline>>(
        repoSlug,
        `/pipelines?sort=-created_on&pagelen=25`,
      );
      return { repoSlug, pipelines: res?.values ?? [] };
    }),
  );

  // Flatten all pipelines and batch commit lookups for non-feature branches
  const allPipelines = allRepoResults.flatMap(({ repoSlug, pipelines }) =>
    pipelines.map((p) => ({ repoSlug, pipeline: p })),
  );

  // Batch commit lookups: identify which pipelines need commit messages
  const needsCommitLookup: Array<{ idx: number; repoSlug: string; hash: string }> = [];
  const commitMessages: (string | null)[] = allPipelines.map(({ pipeline }, idx) => {
    const branchName = pipeline.target?.ref_name ?? "";
    const key = extractTicketKey(branchName);
    // Inline commit message from Bitbucket API response
    const inlineMsg = pipeline.target?.commit?.message ?? null;
    if (inlineMsg) return inlineMsg;
    if (!key && pipeline.target?.commit?.hash) {
      needsCommitLookup.push({ idx, repoSlug: allPipelines[idx].repoSlug, hash: pipeline.target.commit.hash });
    }
    return null;
  });

  // Parallel batch: fetch commit messages for pipelines that need them
  if (needsCommitLookup.length > 0) {
    const commitResults = await Promise.all(
      needsCommitLookup.map(({ repoSlug, hash }) =>
        bbFetch<{ message?: string }>(repoSlug, `/commit/${hash}`),
      ),
    );
    for (let i = 0; i < needsCommitLookup.length; i++) {
      const msg = commitResults[i]?.message ?? null;
      commitMessages[needsCommitLookup[i].idx] = msg;
    }
  }

  // Resolve ticket keys and enrichment from commit messages
  const resolvedData = allPipelines.map(({ repoSlug, pipeline: p }, idx) => {
    const branchName = p.target?.ref_name ?? "";
    const msg = commitMessages[idx];
    const firstLine = msg ? msg.split("\n")[0].substring(0, 200) : null;

    // Ticket keys: from branch name, then from commit message
    let primaryKey = extractTicketKey(branchName);
    let allKeys: string[] = [];
    if (primaryKey) allKeys.push(primaryKey);
    if (msg) {
      const fromMsg = extractAllTicketKeys(msg);
      for (const k of fromMsg) {
        if (!allKeys.includes(k)) allKeys.push(k);
      }
    }
    if (!primaryKey && allKeys.length > 0) primaryKey = allKeys[0];

    // For merge-triggered pipelines: extract source branch and PR number
    const mergeInfo = msg ? extractMergeInfo(msg) : { sourceBranch: null, prNumber: null };

    return {
      ticketKey: primaryKey,
      ticketKeys: allKeys.length > 1 ? allKeys : null,
      commitMessage: firstLine,
      sourceBranch: mergeInfo.sourceBranch,
      prNumber: mergeInfo.prNumber,
      repoSlug,
    };
  });

  // Batch PR lookups for merge-triggered pipelines with PR numbers
  const prLookups: Array<{ idx: number; repoSlug: string; prNumber: number }> = [];
  for (let i = 0; i < resolvedData.length; i++) {
    const d = resolvedData[i];
    if (d.prNumber) {
      prLookups.push({ idx: i, repoSlug: d.repoSlug, prNumber: d.prNumber });
    }
  }

  interface BbPrBasic { title?: string; author?: { display_name?: string }; links?: { html?: { href: string } } }
  const prData: Array<{ title: string | null; author: string | null; url: string | null }> = resolvedData.map(() => ({
    title: null, author: null, url: null,
  }));

  if (prLookups.length > 0) {
    const prResults = await Promise.all(
      prLookups.map(({ repoSlug, prNumber }) =>
        bbFetch<BbPrBasic>(repoSlug, `/pullrequests/${prNumber}`),
      ),
    );
    for (let i = 0; i < prLookups.length; i++) {
      const pr = prResults[i];
      if (pr) {
        const idx = prLookups[i].idx;
        prData[idx] = {
          title: pr.title ?? null,
          author: pr.author?.display_name ?? null,
          url: pr.links?.html?.href ?? null,
        };
      }
    }
  }

  // Persist pipeline data with enrichment
  for (let i = 0; i < allPipelines.length; i++) {
    const { repoSlug, pipeline: p } = allPipelines[i];
    const id = `${repoSlug}:${p.build_number}`;
    const state = normalisePipelineState(p);
    const branchName = p.target?.ref_name ?? "";
    const rd = resolvedData[i];
    const pr = prData[i];
    const creator = p.creator?.display_name ?? p.creator?.nickname ?? null;
    const pipelineUrl = p.links?.html?.href
      || `https://bitbucket.org/${cfg.workspace}/${repoSlug}/pipelines/results/${p.build_number}`;

    const existing = db
      .select()
      .from(pipelineRun)
      .where(eq(pipelineRun.id, id))
      .get();

    if (existing) {
      const needsCreatorUpdate = !existing.creator && creator;
      const needsEnrichment = !existing.commitMessage && rd.commitMessage;
      if (existing.state !== state || needsCreatorUpdate || needsEnrichment) {
        if (existing.state !== state) {
          stateChanges.push({ run: existing, oldState: existing.state });
        }
        db.update(pipelineRun)
          .set({
            state,
            previousState: existing.state !== state ? existing.state : existing.previousState,
            completedAt: p.completed_on ?? null,
            durationSeconds: p.duration_in_seconds ?? null,
            ...(creator ? { creator } : {}),
            ...(needsEnrichment ? {
              commitMessage: rd.commitMessage,
              ticketKeys: rd.ticketKeys ? JSON.stringify(rd.ticketKeys) : null,
              sourceBranch: rd.sourceBranch,
              prUrl: pr.url,
              prTitle: pr.title,
              prAuthor: pr.author,
            } : {}),
          })
          .where(eq(pipelineRun.id, id))
          .run();
        updatedRuns++;
      }
    } else {
      db.insert(pipelineRun)
        .values({
          id,
          repo: shortRepoName(repoSlug),
          buildNumber: p.build_number,
          branchName,
          ticketKey: rd.ticketKey,
          ticketKeys: rd.ticketKeys ? JSON.stringify(rd.ticketKeys) : null,
          state,
          creator,
          durationSeconds: p.duration_in_seconds ?? null,
          pipelineUrl,
          isDeployment: false,
          environment: null,
          environmentType: null,
          createdAt: p.created_on ?? new Date().toISOString(),
          completedAt: p.completed_on ?? null,
          commitMessage: rd.commitMessage,
          sourceBranch: rd.sourceBranch,
          prUrl: pr.url,
          prTitle: pr.title,
          prAuthor: pr.author,
        })
        .run();
      newRuns++;

      if (state !== "IN_PROGRESS") {
        pendingDeployDetection.push({ repoSlug, buildNumber: p.build_number, id });
      }
    }
  }

  // Deployment detection for new completed pipelines (limit to 5 per sync)
  const detectBatch = pendingDeployDetection.slice(0, 5);
  if (detectBatch.length > 0) {
    await Promise.all(
      detectBatch.map(async ({ repoSlug, buildNumber, id }) => {
        try {
          const stepsRes = await bbFetch<BbPaginatedResponse<BbPipelineStep>>(
            repoSlug,
            `/pipelines/${buildNumber}/steps?pagelen=25`,
          );
          let detectedEnv: { environment: string; type: "Production" | "Staging" | "Test" } | null = null;
          for (const step of stepsRes?.values ?? []) {
            const envFromStep = detectEnvironment(step.name);
            if (envFromStep) detectedEnv = envFromStep;
            if (step.name.toLowerCase().includes("deploy") && !step.name.toLowerCase().includes("set build") && detectedEnv) {
              db.update(pipelineRun)
                .set({
                  isDeployment: true,
                  environment: detectedEnv.environment,
                  environmentType: detectedEnv.type,
                })
                .where(eq(pipelineRun.id, id))
                .run();
              break;
            }
          }
        } catch {
          // Deployment detection is best-effort
        }
      }),
    );
  }

  // Generate notifications for state changes on followed tickets
  if (stateChanges.length > 0) {
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

  return { newRuns, updatedRuns, stateChanges: stateChanges.length };
}
