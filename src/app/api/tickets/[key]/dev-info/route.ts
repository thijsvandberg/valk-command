import { NextResponse } from "next/server";

// Normalised shapes returned to the client
export interface DevBranch {
  name: string;
  url: string;
  lastCommit: { id: string; message: string; date: string; author: string } | null;
}

export interface DevPullRequest {
  id: string;
  title: string;
  url: string;
  status: "OPEN" | "MERGED" | "DECLINED";
  author: string;
  reviewers: string[];
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
  state: "SUCCESSFUL" | "FAILED" | "IN_PROGRESS";
  completedAt: string | null;
}

export interface DevInfoPayload {
  branches: DevBranch[];
  pullRequests: DevPullRequest[];
  commits: DevCommit[];
  builds: DevBuild[];
}

const EMPTY: DevInfoPayload = { branches: [], pullRequests: [], commits: [], builds: [] };

function getBitbucketConfig() {
  return {
    workspace: process.env.BITBUCKET_WORKSPACE ?? "",
    repoSlug: process.env.BITBUCKET_REPO_SLUG ?? "",
    email: process.env.BITBUCKET_EMAIL ?? process.env.JIRA_EMAIL ?? "",
    token: process.env.BITBUCKET_APP_PASSWORD ?? process.env.BITBUCKET_API_TOKEN ?? "",
  };
}

function isConfigured() {
  const cfg = getBitbucketConfig();
  return Boolean(cfg.workspace && cfg.repoSlug && cfg.email && cfg.token);
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

interface BbPullRequest {
  id: number;
  title: string;
  state: string;
  links?: { html?: { href: string } };
  author?: { display_name: string };
  reviewers?: Array<{ display_name: string }>;
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

async function bbFetch<T>(path: string): Promise<T | null> {
  const cfg = getBitbucketConfig();
  const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
  const url = `https://api.bitbucket.org/2.0/repositories/${cfg.workspace}/${cfg.repoSlug}${path}`;

  const res = await fetch(url, {
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
    // "Name <email>" -> "Name"
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

function normalisePipelineState(pipeline: BbPipeline): DevBuild["state"] {
  const stateName = pipeline.state?.name?.toUpperCase() ?? "";
  const resultName = pipeline.state?.result?.name?.toUpperCase() ?? "";
  if (stateName === "COMPLETED") {
    if (resultName === "SUCCESSFUL") return "SUCCESSFUL";
    if (resultName === "FAILED" || resultName === "ERROR") return "FAILED";
  }
  return "IN_PROGRESS";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  if (!isConfigured()) {
    return NextResponse.json(EMPTY);
  }

  try {
    // Search Bitbucket for branches and PRs containing the ticket key
    const encodedKey = encodeURIComponent(key);
    const branchQuery = encodeURIComponent(`name ~ "${key}"`);
    const prQuery = encodeURIComponent(`title ~ "${key}"`);

    const [branchRes, prRes] = await Promise.all([
      bbFetch<BbPaginatedResponse<BbBranch>>(
        `/refs/branches?q=${branchQuery}&pagelen=10`,
      ),
      bbFetch<BbPaginatedResponse<BbPullRequest>>(
        `/pullrequests?q=${prQuery}&state=OPEN&state=MERGED&state=DECLINED&pagelen=10`,
      ),
    ]);

    const branches: DevBranch[] = (branchRes?.values ?? []).map((b) => ({
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
    }));

    const pullRequests: DevPullRequest[] = (prRes?.values ?? []).map((pr) => ({
      id: String(pr.id),
      title: pr.title,
      url: pr.links?.html?.href ?? "",
      status: normalisePrStatus(pr.state),
      author: pr.author?.display_name ?? "Unknown",
      reviewers: (pr.reviewers ?? []).map((r) => r.display_name),
    }));

    // Collect commits from branches (latest commit per branch, already in branch data)
    const commits: DevCommit[] = (branchRes?.values ?? [])
      .filter((b) => b.target)
      .map((b) => ({
        id: b.target!.hash.slice(0, 12),
        message: b.target!.message?.split("\n")[0] ?? "",
        date: b.target!.date,
        author: extractAuthor(b.target!.author?.raw, b.target!.author?.user),
        url: b.target!.links?.html?.href ?? "",
      }));

    // Fetch pipelines for matched branches
    let builds: DevBuild[] = [];
    const branchNames = branches.map((b) => b.name);
    if (branchNames.length > 0) {
      const pipelineQuery = encodeURIComponent(
        `target.ref_name="${branchNames[0]}"`,
      );
      const pipelineRes = await bbFetch<BbPaginatedResponse<BbPipeline>>(
        `/pipelines?q=${pipelineQuery}&sort=-created_on&pagelen=5`,
      );
      builds = (pipelineRes?.values ?? []).map((p) => ({
        name: `Pipeline #${p.build_number}`,
        url: p.links?.html?.href ?? "",
        state: normalisePipelineState(p),
        completedAt: p.completed_on ?? null,
      }));
    }

    const payload: DevInfoPayload = { branches, pullRequests, commits, builds };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Dev-info fetch failed:", err);
    return NextResponse.json(EMPTY);
  }
}
