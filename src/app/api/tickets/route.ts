import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketLocalEdit, storyVersion, ticketSubtask, sprintNameCache } from "@/db/schema";
import { eq, inArray, asc, isNull, sql, and, notInArray } from "drizzle-orm";
import type { Ticket, IssueType, JiraStatus, POStatus, TicketReadiness, Assignee, TicketEditState } from "@/types/ticket";
import { computeTicketEditState } from "@/lib/ticket-state";
import { timedQuery } from "@/lib/query-timer";
import { cache } from "@/lib/cache";
import { enqueue as enqueueForRevalidation } from "@/lib/revalidation-queue";

function userInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

function buildAssignee(name: string | null): Assignee | null {
  if (!name) return null;
  return { name, initials: userInitials(name), color: userColor(name) };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  const cacheKey = `/api/tickets${sprintId ? `?sprintId=${sprintId}` : ""}`;
  const cached = cache.get<Ticket[]>(cacheKey);
  if (cached) {
    enqueueForRevalidation(cached.filter((t) => !t.removedFromJiraAt).map((t) => t.key));
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
      },
    });
  }

  const isBacklog = sprintId === "__backlog__";

  const { result: { rows, allLocalEdits, allVersions, subtaskCounts }, durationMs } = await timedQuery(
    `GET /api/tickets${sprintId ? `?sprintId=${sprintId}` : ""}`,
    async () => {
      const draftFilter = notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED"]);
      const mainQuery = db
        .select({ t: ticket, meta: ticketMetadata, sprintDisplayName: sprintNameCache.displayName })
        .from(ticket)
        .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
        .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId));

      // Backlog = tickets with empty sprintName
      const sprintFilter = isBacklog
        ? and(draftFilter, eq(ticket.sprintName, ""))
        : sprintId
          ? and(draftFilter, eq(ticket.sprintName, sprintId))
          : draftFilter;

      // Subquery to scope local edits and versions to the same sprint filter without
      // waiting for the main ticket rows first.
      const sprintKeySubquery = (sprintId || isBacklog)
        ? db.select({ jiraKey: ticket.jiraKey }).from(ticket).where(sprintFilter)
        : db.select({ jiraKey: ticket.jiraKey }).from(ticket).where(draftFilter);

      const [rows, allLocalEdits, allVersions, subtaskCounts] = await Promise.all([
        (sprintId || isBacklog)
          ? mainQuery.where(sprintFilter).orderBy(
              // Null ranks go last; ranked tickets are shown in Jira order
              sql`CASE WHEN ${ticket.jiraRank} IS NULL THEN 1 ELSE 0 END`,
              asc(ticket.jiraRank),
            )
          : mainQuery.where(draftFilter),
        db.select({
          id: ticketLocalEdit.id,
          ticketKey: ticketLocalEdit.ticketKey,
          field: ticketLocalEdit.field,
          localValue: ticketLocalEdit.localValue,
          baseJiraVersion: ticketLocalEdit.baseJiraVersion,
          isDraft: ticketLocalEdit.isDraft,
          modifiedAt: ticketLocalEdit.modifiedAt,
        }).from(ticketLocalEdit).where(inArray(ticketLocalEdit.ticketKey, sprintKeySubquery)),
        db.select({
          jiraKey: storyVersion.jiraKey,
          contentHash: storyVersion.contentHash,
          createdAt: storyVersion.createdAt,
        }).from(storyVersion).where(inArray(storyVersion.jiraKey, sprintKeySubquery)),
        db.select({
          ticketKey: ticketSubtask.ticketKey,
          total: sql<number>`COUNT(*)`.as("total"),
          open: sql<number>`SUM(CASE WHEN ${ticketSubtask.status} NOT IN ('DONE', 'DEPRECATED') THEN 1 ELSE 0 END)`.as("open"),
        }).from(ticketSubtask)
          .where(inArray(ticketSubtask.ticketKey, sprintKeySubquery))
          .groupBy(ticketSubtask.ticketKey),
      ]);

      return { rows, allLocalEdits, allVersions, subtaskCounts };
    },
  );

  const editsByKey = new Map<string, typeof allLocalEdits>();
  for (const edit of allLocalEdits) {
    const existing = editsByKey.get(edit.ticketKey) ?? [];
    existing.push(edit);
    editsByKey.set(edit.ticketKey, existing);
  }

  // Build latestHash per ticket by sorting versions descending by createdAt
  const versionsByKey = new Map<string, { contentHash: string; createdAt: string }[]>();
  for (const v of allVersions) {
    const existing = versionsByKey.get(v.jiraKey) ?? [];
    existing.push({ contentHash: v.contentHash, createdAt: v.createdAt });
    versionsByKey.set(v.jiraKey, existing);
  }
  const latestHashByKey = new Map<string, string>();
  for (const [key, versions] of versionsByKey) {
    versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    latestHashByKey.set(key, versions[0].contentHash);
  }

  const subtaskCountByKey = new Map<string, { total: number; open: number }>();
  for (const row of subtaskCounts) {
    subtaskCountByKey.set(row.ticketKey, { total: row.total, open: row.open ?? 0 });
  }

  const result: Ticket[] = rows.filter(({ t }) => t.type !== "subtask" && t.type !== "epic").map(({ t, meta, sprintDisplayName }) => {
    const edits = editsByKey.get(t.jiraKey) ?? [];
    const latestHash = latestHashByKey.get(t.jiraKey) ?? null;
    const editState: TicketEditState = computeTicketEditState(edits, latestHash);

    return {
      key: t.jiraKey,
      title: t.title,
      type: (t.type ?? "task") as IssueType,
      epic: t.epic ?? null,
      epicKey: t.epicKey ?? null,
      jiraStatus: (t.status ?? "TO DO") as JiraStatus,
      storyPoints: t.storyPoints ?? null,
      assignee: buildAssignee(t.assignee),
      reporter: buildAssignee(t.reporter),
      flagged: t.flagged ?? false,
      readiness: (meta?.readiness ?? null) as TicketReadiness | null,
      poStatus: (meta?.poStatus ?? null) as POStatus,
      qualityScore: meta?.qualityScore ?? null,
      businessValue: meta?.businessValue ?? null,
      editState,
      notes: meta?.poNotes ?? "",
      jiraRank: t.jiraRank ?? null,
      sprintId: t.sprintName || undefined,
      sprintDisplayName: sprintDisplayName ?? null,
      jiraUpdatedAt: t.jiraUpdatedAt ?? null,
      removedFromJiraAt: t.removedFromJiraAt ?? null,
      openSubtaskCount: subtaskCountByKey.get(t.jiraKey)?.open ?? 0,
      totalSubtaskCount: subtaskCountByKey.get(t.jiraKey)?.total ?? 0,
    };
  });

  cache.set(cacheKey, result, 30_000);
  enqueueForRevalidation(result.filter((t) => !t.removedFromJiraAt).map((t) => t.key));

  return NextResponse.json(result, {
    headers: {
      "X-Query-Time-Ms": String(durationMs),
      "X-Cache": "MISS",
      "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
    },
  });
}
