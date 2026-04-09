import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

// Jira dev-status API response shapes (subset we normalise from)
interface DevStatusDetail {
  branches?: Array<{
    name: string;
    url: string;
    lastCommit?: {
      id: string;
      message: string;
      authorTimestamp: string;
      author?: { name: string };
    };
  }>;
  pullRequests?: Array<{
    id: string;
    name: string;
    url: string;
    status: string;
    author?: { name: string };
    reviewers?: Array<{ name: string; approved: boolean }>;
  }>;
  commits?: Array<{
    id: string;
    message: string;
    authorTimestamp: string;
    author?: { name: string };
    url: string;
  }>;
  builds?: Array<{
    buildNumber: number;
    name: string;
    url: string;
    state: string;
    completionDate?: string;
  }>;
}

interface DevStatusResponse {
  detail?: DevStatusDetail[];
}

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

function getJiraConfig() {
  const cloudId = process.env.JIRA_CLOUD_ID ?? "";
  const directUrl = process.env.JIRA_BASE_URL ?? "";
  const baseUrl = cloudId
    ? `https://api.atlassian.com/ex/jira/${cloudId}`
    : directUrl;
  return {
    baseUrl,
    email: process.env.JIRA_EMAIL ?? "",
    apiToken: process.env.JIRA_API_TOKEN ?? "",
  };
}

function isConfigured() {
  const cfg = getJiraConfig();
  return Boolean(cfg.baseUrl && cfg.email && cfg.apiToken);
}

async function fetchDevStatus(issueId: string, dataType: string): Promise<DevStatusResponse> {
  const cfg = getJiraConfig();
  const applicationType = process.env.JIRA_DEV_APPLICATION_TYPE ?? "stash";
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
  const url = `${cfg.baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=${applicationType}&dataType=${dataType}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) return {};
  return res.json() as Promise<DevStatusResponse>;
}

function normalisePrStatus(raw: string): DevPullRequest["status"] {
  const upper = raw.toUpperCase();
  if (upper === "MERGED") return "MERGED";
  if (upper === "DECLINED") return "DECLINED";
  return "OPEN";
}

function normaliseBuildState(raw: string): DevBuild["state"] {
  const upper = raw.toUpperCase();
  if (upper === "SUCCESSFUL" || upper === "SUCCESS") return "SUCCESSFUL";
  if (upper === "FAILED" || upper === "FAILURE") return "FAILED";
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

  // Resolve jiraId from DB
  const row = await db
    .select({ jiraId: ticket.jiraId })
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  if (!row?.jiraId) {
    return NextResponse.json(EMPTY);
  }

  try {
    const [branchRes, prRes, buildRes] = await Promise.all([
      fetchDevStatus(row.jiraId, "branch"),
      fetchDevStatus(row.jiraId, "pullrequest"),
      fetchDevStatus(row.jiraId, "build"),
    ]);

    const branchDetail = branchRes.detail?.[0];
    const prDetail = prRes.detail?.[0];
    const buildDetail = buildRes.detail?.[0];

    const branches: DevBranch[] = (branchDetail?.branches ?? []).map((b) => ({
      name: b.name,
      url: b.url,
      lastCommit: b.lastCommit
        ? {
            id: b.lastCommit.id,
            message: b.lastCommit.message,
            date: b.lastCommit.authorTimestamp,
            author: b.lastCommit.author?.name ?? "Unknown",
          }
        : null,
    }));

    const pullRequests: DevPullRequest[] = (prDetail?.pullRequests ?? []).map((pr) => ({
      id: pr.id,
      title: pr.name,
      url: pr.url,
      status: normalisePrStatus(pr.status),
      author: pr.author?.name ?? "Unknown",
      reviewers: (pr.reviewers ?? []).map((r) => r.name),
    }));

    // Commits come from the branch response
    const commits: DevCommit[] = (branchDetail?.commits ?? []).map((c) => ({
      id: c.id,
      message: c.message,
      date: c.authorTimestamp,
      author: c.author?.name ?? "Unknown",
      url: c.url,
    }));

    const builds: DevBuild[] = (buildDetail?.builds ?? []).map((b) => ({
      name: b.name,
      url: b.url,
      state: normaliseBuildState(b.state),
      completedAt: b.completionDate ?? null,
    }));

    const payload: DevInfoPayload = { branches, pullRequests, commits, builds };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Dev-info fetch failed:", err);
    return NextResponse.json(EMPTY);
  }
}
