import { NextResponse } from "next/server";
import { jiraClient, extractSprint } from "@/lib/jira-client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

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
  const issuetype = searchParams.get("issuetype") ?? "";

  if (!q.trim() && !jqlOverride.trim() && !issuetype.trim()) {
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
    let jql: string;
    if (jqlOverride.trim()) {
      jql = jqlOverride.trim();
    } else {
      const parts = [`project = ${cfg.projectKey}`];
      if (issuetype.trim()) parts.push(`issuetype = "${issuetype.trim()}"`);
      // Subtasks are hidden by default to match local search; an explicit issuetype opts back in.
      else parts.push(`issuetype != subtask`);
      if (q.trim()) parts.push(`text ~ "${q.replace(/"/g, '\\"')}"`);
      jql = `${parts.join(" AND ")} ORDER BY updated DESC`;
    }

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
    logger.error("search-jira", "GET failed", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  } finally {
    inFlightController = null;
  }
}
