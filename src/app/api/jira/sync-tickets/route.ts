import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, storyVersion, syncLog, ticketAttachment } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { jiraClient, extractStoryPoints, extractEpicLink, extractAcceptanceCriteria, type JiraIssue, type JiraAttachment } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { createHash } from "crypto";
import { registerSync, unregisterSync } from "@/lib/sync-abort";

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

async function upsertIssue(issue: JiraIssue, sprintName: string, _signal?: AbortSignal) {
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

    // VC-017: staleness is now computed from local edits vs Jira mirror, no flag needed
  }

  // Sync attachment metadata from the already-fetched issue data (no extra API call)
  const attachments: JiraAttachment[] = issue.fields.attachment ?? [];
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
 * POST /api/jira/sync-tickets
 *
 * Two modes:
 *   1. Body { ticketKeys: ["VPL-123"] } - syncs only the listed tickets
 *   2. Query ?sprintId=xxx&strategy=bulk|timestamp-first - syncs all sprint tickets
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  // Check body for single-ticket mode
  let ticketKeys: string[] | undefined;
  if (!sprintId) {
    try {
      const body = await request.json();
      if (Array.isArray(body?.ticketKeys) && body.ticketKeys.length > 0) {
        ticketKeys = body.ticketKeys;
      }
    } catch {
      // No valid JSON body
    }
  }

  if (ticketKeys) {
    return syncIndividualTickets(ticketKeys);
  }

  return syncSprint(sprintId, searchParams.get("strategy") ?? "bulk");
}

async function syncIndividualTickets(ticketKeys: string[]) {
  const logId = `sync-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const scope = ticketKeys.join(",");

  await db.insert(syncLog).values({
    id: logId,
    type: "ticket-sync",
    scope,
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);

  try {
    const results = [];
    for (const key of ticketKeys) {
      const issue = await jiraClient.getIssue(key, controller.signal);
      const existing = await db.query.ticket.findFirst({
        where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
      });
      const info = await upsertIssue(issue, existing?.sprintName ?? "", controller.signal);
      results.push(info);
    }

    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(syncLog).set({
      status: "success",
      summary: `${results.length} ticket${results.length === 1 ? "" : "s"} synced`,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(syncLog.id, logId));

    return NextResponse.json({
      ok: true,
      count: results.length,
      live: jiraClient.isLive,
      strategy: "individual",
      tickets: results,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "Sync cancelled" }, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(syncLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(syncLog.id, logId));

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    unregisterSync(logId);
  }
}

async function syncSprint(sprintId: string | null, strategy: string) {
  const logId = `sync-${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();

  await db.insert(syncLog).values({
    id: logId,
    type: "sprint-sync",
    scope: "",
    status: "running",
    startedAt,
  });

  const controller = registerSync(logId);

  try {
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
      issues = await fetchTimestampFirst(sprintIdNum, controller.signal);
    } else {
      issues = await jiraClient.getSprintIssues(sprintIdNum, controller.signal);
    }

    const results = [];
    for (const issue of issues) {
      const info = await upsertIssue(issue, sprintId, controller.signal);
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
    if (err instanceof DOMException && err.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "Sync cancelled" }, { status: 499 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - new Date(startedAt).getTime();
    await db.update(syncLog).set({
      status: "failed",
      errorDetail: message,
      durationMs,
      completedAt: new Date().toISOString(),
    }).where(eq(syncLog.id, logId));

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    unregisterSync(logId);
  }
}

/**
 * Timestamp-first strategy: lightweight first pass fetches only key+updated,
 * then fetches full data only for issues changed since last local sync.
 */
async function fetchTimestampFirst(sprintIdNum: number, signal?: AbortSignal): Promise<JiraIssue[]> {
  const lightweight = await jiraClient.getSprintIssueTimestamps(sprintIdNum, signal);
  if (lightweight.length === 0) return [];

  const allKeys = lightweight.map((item) => item.key);
  const localTickets = await db
    .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
    .from(ticket)
    .where(inArray(ticket.jiraKey, allKeys));

  const localMap = new Map(localTickets.map((t) => [t.jiraKey, t.jiraUpdatedAt]));

  const changedKeys = lightweight
    .filter((item) => localMap.get(item.key) !== item.updated)
    .map((item) => item.key);

  if (changedKeys.length === 0) return [];

  return jiraClient.getIssuesByKeys(changedKeys, signal);
}
