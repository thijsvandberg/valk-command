import { NextResponse } from "next/server";
import { jiraClient, extractSprint } from "@/lib/jira-client";
import { env } from "@/lib/env";

export interface JiraSearchResult {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  sprintName: string | null;
  url: string;
}

// Guard against overlapping in-flight Jira search requests.
// A single-user app; concurrent searches are undesirable.
let inFlightController: AbortController | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const jqlOverride = searchParams.get("jql") ?? "";

  if (!q.trim() && !jqlOverride.trim()) {
    return NextResponse.json({ issues: [] });
  }

  if (jqlOverride.length > 1000) {
    return NextResponse.json({ error: "JQL query too long" }, { status: 400 });
  }

  // Cancel any previous in-flight request before starting a new one
  if (inFlightController) {
    inFlightController.abort();
  }
  inFlightController = new AbortController();
  const { signal } = inFlightController;

  try {
    const cfg = { projectKey: env.JIRA_PROJECT_KEY };
    const jql = jqlOverride.trim()
      ? jqlOverride.trim()
      : `project = ${cfg.projectKey} AND text ~ "${q.replace(/"/g, '\\"')}" ORDER BY updated DESC`;

    const jiraIssues = await jiraClient.searchIssues(jql, undefined, 25, signal);

    const baseUrl = env.NEXT_PUBLIC_JIRA_BASE_URL.replace(/\/$/, "");

    const issues: JiraSearchResult[] = jiraIssues.map((issue) => {
      const sprint = extractSprint(issue.fields);
      return {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        assignee: issue.fields.assignee?.displayName ?? null,
        sprintName: sprint?.name ?? null,
        url: `${baseUrl}/browse/${issue.key}`,
      };
    });

    return NextResponse.json({ issues });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ issues: [] });
    }
    console.error("[search/jira GET]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  } finally {
    inFlightController = null;
  }
}
