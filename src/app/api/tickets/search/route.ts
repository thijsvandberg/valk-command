import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketLink } from "@/db/schema";
import { like, or, ne, and, desc } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";

const JIRA_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;
const SPARSE_THRESHOLD = 5;
const MAX_RESULTS = 15;
const RECENT_LIMIT = 5;

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  source: "local" | "jira";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const exclude = url.searchParams.get("exclude");
  const jiraEnabled = url.searchParams.get("jira") !== "0";
  const recentOnly = url.searchParams.get("recent") === "1";

  // Recent links mode: return recently linked issues from the local DB
  if (recentOnly) {
    const recentLinks = await db
      .selectDistinct({
        key: ticketLink.linkedKey,
        title: ticketLink.title,
        type: ticketLink.type,
        status: ticketLink.status,
      })
      .from(ticketLink)
      .where(exclude ? ne(ticketLink.linkedKey, exclude) : undefined)
      .orderBy(desc(ticketLink.id))
      .limit(RECENT_LIMIT);

    return NextResponse.json(
      recentLinks.map((r) => ({ ...r, type: r.type ?? "task", source: "recent" as const })),
    );
  }

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;
  const conditions = [
    or(
      like(ticket.jiraKey, pattern),
      like(ticket.title, pattern),
    ),
  ];

  if (exclude) {
    conditions.push(ne(ticket.jiraKey, exclude));
  }

  const localResults = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
    })
    .from(ticket)
    .where(and(...conditions))
    .limit(MAX_RESULTS);

  const results: SearchResult[] = localResults.map((r) => ({ ...r, type: r.type ?? "task", source: "local" as const }));

  // Skip Jira fallback when we have enough local results or jira is disabled
  if (results.length >= SPARSE_THRESHOLD || !jiraEnabled) {
    return NextResponse.json(results);
  }

  // Fallback to Jira when local results are sparse
  const localKeys = new Set(results.map((r) => r.key));
  try {
    if (JIRA_KEY_RE.test(q)) {
      const issue = await jiraClient.getIssue(q.toUpperCase());
      if (issue && (!exclude || issue.key !== exclude) && !localKeys.has(issue.key)) {
        results.push({
          key: issue.key,
          title: issue.fields.summary,
          type: issue.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: issue.fields.status?.name ?? "To Do",
          source: "jira",
        });
      }
    } else {
      const jql = `text ~ "${q.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
      const issues = await jiraClient.searchIssues(jql, ["summary", "status", "issuetype"], 10);
      for (const i of issues) {
        if (i.key === exclude || localKeys.has(i.key)) continue;
        if (results.length >= MAX_RESULTS) break;
        results.push({
          key: i.key,
          title: i.fields.summary,
          type: i.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: i.fields.status?.name ?? "To Do",
          source: "jira",
        });
      }
    }
  } catch {
    // Jira unavailable: return whatever local results we have
  }

  return NextResponse.json(results);
}
