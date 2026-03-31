import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, storyVersion } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, type JiraIssue } from "@/lib/jira-client";
import { createHash } from "crypto";

/**
 * Map a Jira issue-type name to our local enum.
 */
function normalizeIssueType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("bug")) return "bug";
  if (lower.includes("sub")) return "subtask";
  if (lower.includes("story")) return "story";
  return "task";
}

/**
 * Map a Jira status name to the uppercase convention used in the UI.
 */
function normalizeStatus(name: string): string {
  const upper = name.toUpperCase();
  if (upper === "TO DO" || upper === "BACKLOG" || upper === "OPEN") return "TO DO";
  if (upper.includes("PROGRESS")) return "IN PROGRESS";
  if (upper === "TEST" || upper === "IN REVIEW" || upper === "REVIEW") return "TEST";
  if (upper === "DONE" || upper === "CLOSED" || upper === "RESOLVED") return "DONE";
  return upper;
}

/**
 * Compute a hash for a story's description + acceptance criteria so we can
 * detect content changes between syncs.
 */
function contentHash(description: unknown, ac: string | null | undefined): string {
  const text = `${JSON.stringify(description ?? "")}|${ac ?? ""}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Derive user initials and a deterministic color from a display name.
 */
function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

/**
 * Upsert a single Jira issue into the local ticket + ticket_metadata tables.
 * Also handles story-version tracking for stale-score detection.
 */
async function upsertIssue(issue: JiraIssue, sprintName: string) {
  const fields = issue.fields;
  const storyPoints = fields.customfield_10028 ?? fields.story_points ?? null;
  const epic = fields.customfield_10008 ?? null;
  const assigneeName = fields.assignee?.displayName ?? null;
  const priority = fields.priority?.name ?? null;

  const now = new Date().toISOString();

  const existing = await db.query.ticket.findFirst({
    where: (row, { eq }) => eq(row.jiraKey, issue.key),
  });

  const ticketData = {
    jiraKey: issue.key,
    title: fields.summary,
    status: normalizeStatus(fields.status.name),
    assignee: assigneeName,
    storyPoints,
    sprintName,
    labels: fields.labels.length > 0 ? JSON.stringify(fields.labels) : null,
    priority,
    lastSyncedAt: now,
  };

  if (existing) {
    await db.update(ticket).set(ticketData).where(eq(ticket.jiraKey, issue.key));
  } else {
    await db.insert(ticket).values(ticketData);
  }

  // Ensure metadata row exists
  const meta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq }) => eq(m.jiraKey, issue.key),
  });
  if (!meta) {
    await db.insert(ticketMetadata).values({ jiraKey: issue.key });
  }

  // Story version tracking: detect if content changed
  const hash = contentHash(fields.description, fields.customfield_10034);
  const latestVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq }) => eq(sv.jiraKey, issue.key),
    orderBy: (sv, { desc }) => [desc(sv.createdAt)],
  });

  if (!latestVersion || latestVersion.contentHash !== hash) {
    await db.insert(storyVersion).values({
      id: `sv-${issue.key}-${Date.now()}`,
      jiraKey: issue.key,
      description: JSON.stringify(fields.description ?? ""),
      acceptanceCriteria: fields.customfield_10034 ?? null,
      contentHash: hash,
    });

    // Mark quality score as stale when content changed and there was a previous version
    if (latestVersion) {
      await db
        .update(ticketMetadata)
        .set({ qualityStale: true })
        .where(eq(ticketMetadata.jiraKey, issue.key));
    }
  }

  // Store extra data used by the UI as JSON in the ticket's labels field
  // (epic, type, flagged, assignee details are derived at read time from
  // the ticket + metadata tables and the Jira fields we stored)
  return {
    key: issue.key,
    type: normalizeIssueType(fields.issuetype.name),
    epic,
    flagged: Boolean(fields.flagged),
    assigneeColor: assigneeName ? userColor(assigneeName) : null,
  };
}

/**
 * POST /api/jira/sync-tickets?sprintId=xxx
 *
 * Fetches all issues for the given sprint from Jira (or mock) and upserts
 * them into the local database.
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sprintId = searchParams.get("sprintId");

    if (!sprintId) {
      return NextResponse.json(
        { error: "sprintId query parameter is required" },
        { status: 400 },
      );
    }

    const sprintIdNum = parseInt(sprintId, 10);
    if (isNaN(sprintIdNum)) {
      return NextResponse.json(
        { error: "sprintId must be a number" },
        { status: 400 },
      );
    }

    const issues = await jiraClient.getSprintIssues(sprintIdNum);
    const results = [];

    for (const issue of issues) {
      const info = await upsertIssue(issue, sprintId);
      results.push(info);
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      live: jiraClient.isLive,
      tickets: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
