import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, storyVersion, syncLog, ticketAttachment } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jiraClient, extractStoryPoints, extractEpicLink, extractAcceptanceCriteria, type JiraIssue } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { createHash } from "crypto";

function normalizeIssueType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("bug")) return "bug";
  if (lower.includes("sub")) return "subtask";
  if (lower.includes("story")) return "story";
  return "task";
}

function normalizeStatus(name: string): string {
  const upper = name.toUpperCase();
  if (upper === "TO DO" || upper === "BACKLOG" || upper === "OPEN") return "TO DO";
  if (upper.includes("PROGRESS")) return "IN PROGRESS";
  if (upper === "TEST" || upper === "IN REVIEW" || upper === "REVIEW") return "TEST";
  if (upper === "DONE" || upper === "CLOSED" || upper === "RESOLVED") return "DONE";
  return upper;
}

function contentHash(description: unknown, ac: string | null | undefined): string {
  const text = `${JSON.stringify(description ?? "")}|${ac ?? ""}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

async function upsertIssue(issue: JiraIssue, sprintName: string) {
  const fields = issue.fields;
  const storyPoints = extractStoryPoints(fields);
  const epicValue = extractEpicLink(fields);
  const ac = extractAcceptanceCriteria(fields);
  const assigneeName = fields.assignee?.displayName ?? null;
  const assigneeAvatar = fields.assignee?.avatarUrls?.["48x48"] ?? null;
  const reporterName = fields.reporter?.displayName ?? null;
  const priority = fields.priority?.name ?? null;
  const componentsArr = fields.components ?? [];
  const componentsJson = componentsArr.length > 0
    ? JSON.stringify(componentsArr.map((c) => c.name))
    : null;

  // Convert ADF description to markdown; fall back gracefully if already a string
  const descriptionMarkdown = typeof fields.description === "string"
    ? fields.description
    : adfToMarkdown(fields.description);

  const now = new Date().toISOString();

  const existing = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, issue.key),
  });

  const ticketData = {
    jiraKey: issue.key,
    title: fields.summary,
    type: normalizeIssueType(fields.issuetype.name),
    status: normalizeStatus(fields.status.name),
    assignee: assigneeName,
    assigneeAvatar,
    epic: epicValue,
    flagged: Boolean(fields.flagged),
    reporter: reporterName,
    description: descriptionMarkdown || null,
    acceptanceCriteria: ac,
    storyPoints,
    sprintName,
    labels: fields.labels.length > 0 ? JSON.stringify(fields.labels) : null,
    priority,
    components: componentsJson,
    jiraCreatedAt: fields.created ?? null,
    jiraUpdatedAt: fields.updated ?? null,
    lastSyncedAt: now,
  };

  if (existing) {
    await db.update(ticket).set(ticketData).where(eq(ticket.jiraKey, issue.key));
  } else {
    await db.insert(ticket).values(ticketData);
  }

  // Ensure metadata row exists
  const meta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, issue.key),
  });
  if (!meta) {
    await db.insert(ticketMetadata).values({ jiraKey: issue.key });
  }

  // Story version tracking: snapshot when content changes
  const hash = contentHash(fields.description, ac);
  const latestVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, issue.key),
    orderBy: (sv, { desc }) => [desc(sv.createdAt)],
  });

  if (!latestVersion || latestVersion.contentHash !== hash) {
    await db.insert(storyVersion).values({
      id: `sv-${issue.key}-${Date.now()}`,
      jiraKey: issue.key,
      description: descriptionMarkdown || JSON.stringify(fields.description ?? ""),
      acceptanceCriteria: ac,
      contentHash: hash,
    });

    if (latestVersion) {
      await db
        .update(ticketMetadata)
        .set({ qualityStale: true })
        .where(eq(ticketMetadata.jiraKey, issue.key));
    }
  }

  // Sync attachment metadata (no file download)
  const attachments = await jiraClient.getAttachments(issue.key);
  for (const att of attachments) {
    const existingAtt = await db.query.ticketAttachment.findFirst({
      where: (a, { eq: eqFn }) => eqFn(a.jiraAttachmentId, att.id),
    });
    if (!existingAtt) {
      await db.insert(ticketAttachment).values({
        id: `att-${att.id}`,
        ticketKey: issue.key,
        jiraAttachmentId: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
      });
    }
  }

  return {
    key: issue.key,
    type: normalizeIssueType(fields.issuetype.name),
    epic: epicValue,
    flagged: Boolean(fields.flagged),
    assigneeColor: assigneeName ? userColor(assigneeName) : null,
  };
}

/**
 * POST /api/jira/sync-tickets?sprintId=xxx&strategy=bulk|timestamp-first
 *
 * Fetches all issues for the given sprint from Jira and upserts them locally.
 * Supports two strategies:
 *   bulk (default) - fetches all issues with full fields in one JQL query
 *   timestamp-first - first fetches only key+updated, then full data for changed issues
 */
export async function POST(request: Request) {
  const logId = `sync-${Date.now()}`;
  const startedAt = new Date().toISOString();

  await db.insert(syncLog).values({
    id: logId,
    type: "sprint-sync",
    scope: "",
    status: "running",
    startedAt,
  });

  try {
    const { searchParams } = new URL(request.url);
    const sprintId = searchParams.get("sprintId");
    const strategy = searchParams.get("strategy") ?? "bulk";

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

    await db.update(syncLog).set({ scope: sprintId }).where(eq(syncLog.id, logId));

    let issues: JiraIssue[];

    if (strategy === "timestamp-first" && jiraClient.isLive) {
      issues = await fetchTimestampFirst(sprintIdNum);
    } else {
      issues = await jiraClient.getSprintIssues(sprintIdNum);
    }

    const results = [];
    for (const issue of issues) {
      const info = await upsertIssue(issue, sprintId);
      results.push(info);
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(syncLog).set({
      status: "success",
      summary: `${results.length} tickets synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(syncLog.id, logId));

    return NextResponse.json({
      ok: true,
      count: results.length,
      live: jiraClient.isLive,
      strategy,
      tickets: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(syncLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(syncLog.id, logId));

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * Timestamp-first strategy: lightweight first pass fetches only key+updated,
 * then fetches full data only for issues changed since last local sync.
 */
async function fetchTimestampFirst(sprintIdNum: number): Promise<JiraIssue[]> {
  // First pass: get only key + updated for all sprint issues
  const lightweight = await jiraClient.getSprintIssueTimestamps(sprintIdNum);

  // Compare against local jiraUpdatedAt
  const changedKeys: string[] = [];
  for (const item of lightweight) {
    const local = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, item.key),
    });
    if (!local || local.jiraUpdatedAt !== item.updated) {
      changedKeys.push(item.key);
    }
  }

  if (changedKeys.length === 0) return [];

  // Second pass: fetch full data only for changed issues
  return jiraClient.getIssuesByKeys(changedKeys);
}
