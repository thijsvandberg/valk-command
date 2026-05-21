import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { like, or, ne, and } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";

const JIRA_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const exclude = url.searchParams.get("exclude");

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
    .limit(15);

  if (localResults.length > 0) {
    return NextResponse.json(localResults);
  }

  // Fallback to Jira when local DB has no matches
  try {
    if (JIRA_KEY_RE.test(q)) {
      const issue = await jiraClient.getIssue(q.toUpperCase());
      if (issue && (!exclude || issue.key !== exclude)) {
        return NextResponse.json([{
          key: issue.key,
          title: issue.fields.summary,
          type: issue.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: issue.fields.status?.name ?? "To Do",
        }]);
      }
    } else {
      const jql = `text ~ "${q.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
      const issues = await jiraClient.searchIssues(jql, ["summary", "status", "issuetype"], 10);
      const mapped = issues
        .filter((i) => i.key !== exclude)
        .map((i) => ({
          key: i.key,
          title: i.fields.summary,
          type: i.fields.issuetype?.name?.toLowerCase() ?? "task",
          status: i.fields.status?.name ?? "To Do",
        }));
      if (mapped.length > 0) {
        return NextResponse.json(mapped);
      }
    }
  } catch {
    // Jira unavailable, return empty
  }

  return NextResponse.json([]);
}
