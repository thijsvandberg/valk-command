import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, sprintNameCache } from "@/db/schema";
import { or, ne, and, desc, isNull, sql, eq } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { escapeLikePattern } from "@/lib/api-validation";
import { escapeJql } from "@/lib/jql";

const JIRA_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;
const SPARSE_THRESHOLD = 5;
const PAGE_SIZE = 25;
const RECENT_LIMIT = 10;

interface SearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  sprintName: string | null;
  source: "local" | "jira" | "recent";
}

const notDeleted = and(
  sql`LOWER(${ticket.status}) != 'deleted'`,
  isNull(ticket.removedFromJiraAt),
);

// Sub-tasks are excluded unless the query looks like a specific Jira key
const notSubTask = sql`LOWER(${ticket.type}) != 'sub-task'`;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const exclude = url.searchParams.get("exclude");
  const jiraEnabled = url.searchParams.get("jira") !== "0";
  const recentOnly = url.searchParams.get("recent") === "1";
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  // Recently updated tickets mode (empty state)
  if (recentOnly) {
    const conditions = [notDeleted, notSubTask];
    if (exclude) conditions.push(ne(ticket.jiraKey, exclude));

    const recentTickets = await db
      .select({
        key: ticket.jiraKey,
        title: ticket.title,
        type: ticket.type,
        status: ticket.status,
        sprintId: ticket.sprintName,
        sprintDisplayName: sprintNameCache.displayName,
      })
      .from(ticket)
      .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
      .where(and(...conditions))
      .orderBy(desc(ticket.jiraUpdatedAt))
      .limit(RECENT_LIMIT);

    return NextResponse.json({
      results: recentTickets.map((r) => ({
        key: r.key,
        title: r.title,
        type: r.type ?? "task",
        status: r.status,
        sprintName: r.sprintDisplayName ?? r.sprintId,
        source: "recent" as const,
      })),
      hasMore: false,
    });
  }

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], hasMore: false });
  }

  const isKeySearch = JIRA_KEY_RE.test(q);

  // Escape the LIKE escape char first, then the % / _ wildcards, so a query
  // containing those characters matches them literally (see ESCAPE clause below).
  const pattern = `%${escapeLikePattern(q.replace(/\\/g, "\\\\"))}%`;
  const conditions = [
    or(
      sql`${ticket.jiraKey} LIKE ${pattern} ESCAPE '\\'`,
      sql`${ticket.title} LIKE ${pattern} ESCAPE '\\'`,
    ),
    notDeleted,
  ];

  // Only filter out sub-tasks for text searches, not when searching for a specific key
  if (!isKeySearch) {
    conditions.push(notSubTask);
  }

  if (exclude) {
    conditions.push(ne(ticket.jiraKey, exclude));
  }

  const localResults = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
      sprintId: ticket.sprintName,
      sprintDisplayName: sprintNameCache.displayName,
    })
    .from(ticket)
    .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
    .where(and(...conditions))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = localResults.length > PAGE_SIZE;
  if (hasMore) localResults.pop();

  const results: SearchResult[] = localResults.map((r) => ({
    key: r.key,
    title: r.title,
    type: r.type ?? "task",
    status: r.status,
    sprintName: r.sprintDisplayName ?? r.sprintId,
    source: "local" as const,
  }));

  // Skip Jira fallback on paginated requests, when we have enough, or when disabled
  if (offset > 0 || results.length >= SPARSE_THRESHOLD || !jiraEnabled) {
    return NextResponse.json({ results, hasMore });
  }

  // Fallback to Jira when local results are sparse
  const localKeys = new Set(results.map((r) => r.key));
  try {
    if (isKeySearch) {
      const issue = await jiraClient.getIssue(q.toUpperCase());
      if (issue && (!exclude || issue.key !== exclude) && !localKeys.has(issue.key)) {
        results.push({
          key: issue.key,
          title: issue.fields.summary,
          type: issue.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: issue.fields.status?.name ?? "To Do",
          sprintName: null,
          source: "jira",
        });
      }
    } else {
      const jql = `text ~ "${escapeJql(q)}" ORDER BY updated DESC`;
      const issues = await jiraClient.searchIssues(jql, ["summary", "status", "issuetype"], 10);
      for (const i of issues) {
        if (i.key === exclude || localKeys.has(i.key)) continue;
        results.push({
          key: i.key,
          title: i.fields.summary,
          type: i.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: i.fields.status?.name ?? "To Do",
          sprintName: null,
          source: "jira",
        });
      }
    }
  } catch {
    // Jira unavailable: return whatever local results we have
  }

  return NextResponse.json({ results, hasMore });
}
