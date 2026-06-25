import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketLocalEdit, storyVersion, ticketSubtask, sprintNameCache, ticketSprint } from "@/db/schema";
import { eq, inArray, asc, isNull, sql, and, notInArray } from "drizzle-orm";
import type { Ticket, IssueType, JiraStatus, POStatus, TicketReadiness, TicketEditState } from "@/types/ticket";
import { computeTicketEditState } from "@/lib/ticket-state";
import { timedQuery } from "@/lib/query-timer";
import { cache } from "@/lib/cache";
import { enqueue as enqueueForRevalidation } from "@/lib/revalidation-queue";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { logger } from "@/lib/logger";
import { withRequestLog } from "@/lib/request-log";
import { createTicketWithJira, CREATABLE_TYPES } from "@/lib/create-ticket";
import { buildAssignee } from "@/lib/user-utils";

async function getTickets(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");

  const cacheKey = `/api/tickets${sprintId ? `?sprintId=${sprintId}` : ""}`;
  const cached = cache.get<Ticket[]>(cacheKey);
  if (cached) {
    enqueueForRevalidation(cached.filter((t) => !t.removedFromJiraAt).map((t) => t.key));
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "no-store",
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

      // A ticket can be in several sprints at once. Membership is resolved against
      // the indexed ticket_sprint bridge (one row per membership) instead of a
      // json_each scan over sprint_ids. The bridge already folds in the legacy
      // sprint_name fallback at write time, so this is a plain indexed lookup.
      const memberOfSprint = inArray(
        ticket.jiraKey,
        db.select({ k: ticketSprint.ticketKey }).from(ticketSprint).where(eq(ticketSprint.sprintId, sprintId!)),
      );

      // Backlog = tickets with empty sprintName
      const sprintFilter = isBacklog
        ? and(draftFilter, eq(ticket.sprintName, ""))
        : sprintId
          ? and(draftFilter, memberOfSprint)
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
      guestimation: meta?.guestimation ?? null,
      assignee: buildAssignee(t.assignee, t.assigneeAccountId),
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
      sprintIds: t.sprintIds ? (JSON.parse(t.sprintIds) as string[]) : undefined,
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

// Create a standalone story/task/bug directly from the sprint board, optionally
// landing it in a sprint and/or under an epic. Mirrors the epic-children create
// route, minus the epic-parent requirement, so the board can create tickets that
// are not children of an epic.
async function createTicket(request: Request) {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { title?: string; issueType?: string; sprintId?: string; epicKey?: string };

  const title = body.title?.trim();
  if (!title) {
    return errorResponse("title is required", 400);
  }

  const issueType = body.issueType ?? "Story";
  if (!CREATABLE_TYPES.includes(issueType)) {
    return errorResponse(`issueType must be one of: ${CREATABLE_TYPES.join(", ")}`, 400);
  }

  let created;
  try {
    created = await createTicketWithJira({
      title,
      issueType,
      sprintId: typeof body.sprintId === "string" ? body.sprintId : undefined,
      epicKey: typeof body.epicKey === "string" ? body.epicKey : undefined,
    });
  } catch (err) {
    logger.error("ticket-create", `Jira create failed: ${err}`);
    const message = err instanceof Error ? err.message : "Jira API error";
    return errorResponse(message, 502);
  }

  return NextResponse.json({
    key: created.key,
    title: created.title,
    type: created.type,
    jiraStatus: "TO DO",
    sprintId: created.sprintId,
    epic: created.epic,
    epicKey: created.epicKey,
    assignee: null,
  });
}

// One access-log line per request (BRDG-400); see src/lib/request-log.ts.
export const GET = withRequestLog(getTickets);
export const POST = withRequestLog(createTicket);
