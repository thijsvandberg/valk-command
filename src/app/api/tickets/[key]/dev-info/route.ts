import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { env } from "@/lib/env";
import { trackOutboundCall } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

// Normalised shapes returned to the client
export interface DevBranch {
  name: string;
  url: string;
  lastCommit: { id: string; message: string; date: string; author: string } | null;
}

export interface PrApproval {
  name: string;
  approved: boolean;
}

export interface DevPullRequest {
  id: string;
  title: string;
  url: string;
  status: "OPEN" | "MERGED" | "DECLINED";
  author: string;
  reviewers: PrApproval[];
  sourceBranch: string;
  destBranch: string;
  commentCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
  diffStats: { filesChanged: number; linesAdded: number; linesRemoved: number } | null;
  buildStatuses: DevBuild[];
  repo: string;
}

export interface DevCommit {
  id: string;
  message: string;
  date: string;
  author: string;
  url: string;
}

export interface DevBuild {
  name: string;
  url: string;
  state: "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED";
  completedAt: string | null;
}

export interface DevDeployment {
  environment: string;
  environmentType: "Production" | "Staging" | "Test";
  pipelineName: string;
  pipelineUrl: string;
  state: DevBuild["state"];
  completedAt: string | null;
  repo: string;
}

export interface DevInfoPayload {
  branches: DevBranch[];
  pullRequests: DevPullRequest[];
  commits: DevCommit[];
  builds: DevBuild[];
  deployments: DevDeployment[];
}

const EMPTY: DevInfoPayload = { branches: [], pullRequests: [], commits: [], builds: [], deployments: [] };

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

// Bitbucket Cloud API v2 types (subset)
interface BbBranch {
  name: string;
  links?: { html?: { href: string } };
  target?: {
    hash: string;
    date: string;
    message: string;
    author?: { raw?: string; user?: { display_name: string } };
    links?: { html?: { href: string } };
  };
}

interface BbParticipant {
  user?: { display_name: string };
  role: string;
  approved: boolean;
  state?: string;
}

interface BbPullRequest {
  id: number;
  title: string;
  state: string;
  links?: { html?: { href: string } };
  author?: { display_name: string };
  reviewers?: Array<{ display_name: string }>;
  participants?: BbParticipant[];
  source?: { branch?: { name: string }; commit?: { hash: string } };
  destination?: { branch?: { name: string } };
  merge_commit?: { hash: string };
  comment_count?: number;
  task_count?: number;
  created_on?: string;
  updated_on?: string;
}

interface BbPipelineStep {
  uuid: string;
  name: string;
  state?: { name: string; result?: { name: string } };
  completed_on?: string;
}

interface BbDiffstatEntry {
  lines_added: number;
  lines_removed: number;
  status: string;
}

interface BbCommitStatus {
  name: string;
  state: string;
  url: string;
  updated_on?: string;
}

interface BbPipeline {
  uuid: string;
  build_number: number;
  state?: { name: string; result?: { name: string } };
  completed_on?: string;
  target?: { ref_name?: string };
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

function extractAuthor(raw?: string, user?: { display_name: string }): string {
  if (user?.display_name) return user.display_name;
  if (raw) {
    const match = raw.match(/^([^<]+)/);
    return match?.[1]?.trim() ?? raw;
  }
  return "Unknown";
}

function normalisePrStatus(raw: string): DevPullRequest["status"] {
  const upper = raw.toUpperCase();
  if (upper === "MERGED") return "MERGED";
  if (upper === "DECLINED" || upper === "SUPERSEDED") return "DECLINED";
  return "OPEN";
}

function normaliseBuildState(raw: string): DevBuild["state"] {
  const upper = raw.toUpperCase();
  if (upper === "SUCCESSFUL") return "SUCCESSFUL";
  if (upper === "FAILED") return "FAILED";
  if (upper === "STOPPED") return "STOPPED";
  return "IN_PROGRESS";
}

function normalisePipelineState(pipeline: BbPipeline): DevBuild["state"] {
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

// Ensures a ticket key like VPL-1337 does not match VPL-13371 (substring false positive)
function containsExactKey(text: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?!\\d)`).test(text);
}

const ENV_PATTERNS: Array<{ pattern: RegExp; environment: string; type: DevDeployment["environmentType"] }> = [
  { pattern: /prod(uction)?/i, environment: "Production", type: "Production" },
  { pattern: /uat\s*3/i, environment: "UAT3", type: "Staging" },
  { pattern: /uat\s*2/i, environment: "UAT2", type: "Staging" },
  { pattern: /uat\s*1/i, environment: "UAT1", type: "Staging" },
  { pattern: /staging/i, environment: "Staging", type: "Staging" },
  { pattern: /test/i, environment: "Test", type: "Test" },
];

function detectEnvironment(stepName: string): { environment: string; type: DevDeployment["environmentType"] } | null {
  for (const ep of ENV_PATTERNS) {
    if (ep.pattern.test(stepName)) return { environment: ep.environment, type: ep.type };
  }
  return null;
}

function normalisePipelineStepState(step: BbPipelineStep): DevBuild["state"] {
  const stateName = step.state?.name?.toUpperCase() ?? "";
  const resultName = step.state?.result?.name?.toUpperCase() ?? "";
  if (stateName === "COMPLETED") {
    if (resultName === "SUCCESSFUL") return "SUCCESSFUL";
    if (resultName === "FAILED" || resultName === "ERROR") return "FAILED";
    if (resultName === "STOPPED") return "STOPPED";
  }
  return "IN_PROGRESS";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const cacheKey = `/api/tickets/${key}/dev-info`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  }

  if (!isConfigured()) {
    return NextResponse.json(EMPTY);
  }

  try {
    const cfg = getBitbucketConfig();
    const branchQuery = encodeURIComponent(`name ~ "${key}"`);
    const prQuery = encodeURIComponent(`title ~ "${key}"`);

    // Phase 1: Query all repos for branches and PRs in parallel
    const repoResults = await Promise.all(
      cfg.repoSlugs.map(async (repo) => {
        const [branchRes, prRes] = await Promise.all([
          bbFetch<BbPaginatedResponse<BbBranch>>(repo, `/refs/branches?q=${branchQuery}&pagelen=10`),
          bbFetch<BbPaginatedResponse<BbPullRequest>>(repo, `/pullrequests?q=${prQuery}&state=OPEN&state=MERGED&state=DECLINED&pagelen=10`),
        ]);
        return { repo, branchRes, prRes };
      }),
    );

    const branches: DevBranch[] = [];
    const commits: DevCommit[] = [];
    const allBranchEntries: Array<{ repo: string; name: string }> = [];
    const prEnrichmentTasks: Array<{ repo: string; pr: BbPullRequest }> = [];

    for (const { repo, branchRes, prRes } of repoResults) {
      for (const b of branchRes?.values ?? []) {
        if (!containsExactKey(b.name, key)) continue;
        branches.push({
          name: b.name,
          url: b.links?.html?.href ?? "",
          lastCommit: b.target
            ? {
                id: b.target.hash.slice(0, 12),
                message: b.target.message?.split("\n")[0] ?? "",
                date: b.target.date,
                author: extractAuthor(b.target.author?.raw, b.target.author?.user),
              }
            : null,
        });
        if (b.target) {
          commits.push({
            id: b.target.hash.slice(0, 12),
            message: b.target.message?.split("\n")[0] ?? "",
            date: b.target.date,
            author: extractAuthor(b.target.author?.raw, b.target.author?.user),
            url: b.target.links?.html?.href ?? "",
          });
        }
        allBranchEntries.push({ repo, name: b.name });
      }

      for (const pr of prRes?.values ?? []) {
        if (!containsExactKey(pr.title, key)) continue;
        prEnrichmentTasks.push({ repo, pr });
      }
    }

    // Phase 2: Enrich PRs with diffstats + build statuses in parallel
    const pullRequests: DevPullRequest[] = await Promise.all(
      prEnrichmentTasks.map(async ({ repo, pr }) => {
        const sourceHash = pr.source?.commit?.hash ?? "";

        // Fetch diffstat and build statuses in parallel per PR
        const [diffstatRes, statusRes] = await Promise.all([
          bbFetch<BbPaginatedResponse<BbDiffstatEntry>>(repo, `/pullrequests/${pr.id}/diffstat`),
          sourceHash
            ? bbFetch<BbPaginatedResponse<BbCommitStatus>>(repo, `/commit/${sourceHash}/statuses`)
            : Promise.resolve(null),
        ]);

        let diffStats: DevPullRequest["diffStats"] = null;
        if (diffstatRes?.values) {
          let filesChanged = 0, linesAdded = 0, linesRemoved = 0;
          for (const entry of diffstatRes.values) {
            filesChanged++;
            linesAdded += entry.lines_added ?? 0;
            linesRemoved += entry.lines_removed ?? 0;
          }
          diffStats = { filesChanged, linesAdded, linesRemoved };
        }

        const buildStatuses: DevBuild[] = (statusRes?.values ?? []).map((s) => ({
          name: s.name,
          url: s.url,
          state: normaliseBuildState(s.state),
          completedAt: s.updated_on ?? null,
        }));

        const reviewers: PrApproval[] = (pr.participants ?? [])
          .filter((p) => p.role === "REVIEWER")
          .map((p) => ({
            name: p.user?.display_name ?? "Unknown",
            approved: p.approved,
          }));

        return {
          id: String(pr.id),
          title: pr.title,
          url: pr.links?.html?.href ?? "",
          status: normalisePrStatus(pr.state),
          author: pr.author?.display_name ?? "Unknown",
          reviewers,
          sourceBranch: pr.source?.branch?.name ?? "",
          destBranch: pr.destination?.branch?.name ?? "",
          commentCount: pr.comment_count ?? 0,
          taskCount: pr.task_count ?? 0,
          createdAt: pr.created_on ?? "",
          updatedAt: pr.updated_on ?? "",
          diffStats,
          buildStatuses,
          repo: shortRepoName(repo),
        };
      }),
    );

    // Phase 3: Fetch deployments for merged PRs via merge commit pipeline steps
    const deployments: DevDeployment[] = [];
    const mergedPrs = prEnrichmentTasks.filter(({ pr }) => pr.state?.toUpperCase() === "MERGED" && pr.merge_commit?.hash);

    if (mergedPrs.length > 0) {
      const deployResults = await Promise.all(
        mergedPrs.map(async ({ repo, pr }) => {
          const mergeHash = pr.merge_commit!.hash;

          // Get build statuses for the merge commit to find the pipeline URL/number
          const statusRes = await bbFetch<BbPaginatedResponse<BbCommitStatus>>(repo, `/commit/${mergeHash}/statuses`);
          const pipelineStatus = (statusRes?.values ?? []).find((s) => s.name.toLowerCase().includes("pipeline"));
          if (!pipelineStatus?.url) return [];

          // Extract pipeline number from URL (e.g. .../pipelines/results/24407)
          const pipelineMatch = pipelineStatus.url.match(/results\/(\d+)/);
          if (!pipelineMatch) return [];
          const pipelineNumber = pipelineMatch[1];

          // Fetch pipeline steps
          const stepsRes = await bbFetch<BbPaginatedResponse<BbPipelineStep>>(repo, `/pipelines/${pipelineNumber}/steps?pagelen=25`);

          const result: DevDeployment[] = [];
          let detectedEnv: { environment: string; type: DevDeployment["environmentType"] } | null = null;

          for (const step of stepsRes?.values ?? []) {
            // Step names like "Set build vars to UAT 1" indicate the target environment
            const envFromStep = detectEnvironment(step.name);
            if (envFromStep) detectedEnv = envFromStep;

            // "AWS Deployment" or similar is the actual deployment step
            if (step.name.toLowerCase().includes("deploy") && !step.name.toLowerCase().includes("set build") && detectedEnv) {
              result.push({
                environment: detectedEnv.environment,
                environmentType: detectedEnv.type,
                pipelineName: `${shortRepoName(repo)}: #${pipelineNumber}`,
                pipelineUrl: pipelineStatus.url,
                state: normalisePipelineStepState(step),
                completedAt: step.completed_on ?? null,
                repo: shortRepoName(repo),
              });
            }
          }

          return result;
        }),
      );

      for (const result of deployResults) {
        deployments.push(...result);
      }
    }

    // Phase 4: Fetch pipelines for matched branches
    const builds: DevBuild[] = [];
    const seenRepos = new Set<string>();
    for (const entry of allBranchEntries) {
      if (seenRepos.has(entry.repo)) continue;
      seenRepos.add(entry.repo);
      const pipelineQuery = encodeURIComponent(`target.ref_name="${entry.name}"`);
      const pipelineRes = await bbFetch<BbPaginatedResponse<BbPipeline>>(
        entry.repo,
        `/pipelines?q=${pipelineQuery}&sort=-created_on&pagelen=5`,
      );
      for (const p of pipelineRes?.values ?? []) {
        builds.push({
          name: `Pipeline #${p.build_number}`,
          url: p.links?.html?.href ?? "",
          state: normalisePipelineState(p),
          completedAt: p.completed_on ?? null,
        });
      }
    }

    const payload: DevInfoPayload = { branches, pullRequests, commits, builds, deployments };
    cache.set(cacheKey, payload, 120_000);
    return NextResponse.json(payload, {
      headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (err) {
    logger.error("dev-info", "fetch failed:", err);
    return NextResponse.json(EMPTY);
  }
}
