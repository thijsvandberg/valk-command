import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketLocalEdit, storyVersion, ticketSubtask, sprintNameCache } from "@/db/schema";
import { eq, inArray, notInArray, and, sql } from "drizzle-orm";
import type { Ticket, IssueType, TicketReadiness, TicketEditState } from "@/types/ticket";
import type { TicketPillHoverData } from "@/components/shared/TicketStatusPill";
import { computeTicketEditState } from "@/lib/ticket-state";
import { buildTicketHoverData } from "@/lib/ticket-hover";
import { buildAssignee } from "@/lib/user-utils";
import { timedQuery } from "@/lib/query-timer";
import { logger } from "@/lib/logger";
import { withRequestLog } from "@/lib/request-log";

// On-demand hover-card data for a bounded, explicit set of ticket keys (BRDG-412).
// Replaces the app-wide useTickets("__all__") feed that the shared hover lookup
// used to pull just to render reference-row tooltips. Returns ONLY the
// buildTicketHoverData shape (a strict subset of the list summary, no detail
// fields), keyed by ticket key. Keys that are not found, or that the board feed
// would exclude (subtasks, epics, draft/replaced statuses), are simply omitted,
// matching the old lookup's "no card" behaviour for those.
const MAX_KEYS = 200;

async function getHoverData(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("keys") ?? "";

  const allKeys = Array.from(
    new Set(raw.split(",").map((k) => k.trim()).filter((k) => k.length > 0)),
  );

  if (allKeys.length === 0) {
    return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
  }

  // Defensive cap; the client batches in smaller chunks, so this is only hit by
  // a direct/oversized call. Truncate loudly rather than silently.
  let keys = allKeys;
  if (keys.length > MAX_KEYS) {
    logger.warn("tickets-hover", `keys capped at ${MAX_KEYS} (received ${allKeys.length})`);
    keys = allKeys.slice(0, MAX_KEYS);
  }

  // Match the board feed's exclusions so a key resolves to a card only when it
  // would have appeared in the old "__all__" list.
  const draftFilter = notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED"]);
  const keyFilter = and(draftFilter, inArray(ticket.jiraKey, keys));

  const { result: { rows, allLocalEdits, allVersions, subtaskCounts } } = await timedQuery(
    "GET /api/tickets/hover",
    async () => {
      const [rows, allLocalEdits, allVersions, subtaskCounts] = await Promise.all([
        db
          .select({ t: ticket, meta: ticketMetadata, sprintDisplayName: sprintNameCache.displayName })
          .from(ticket)
          .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
          .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
          .where(keyFilter),
        db.select({
          id: ticketLocalEdit.id,
          ticketKey: ticketLocalEdit.ticketKey,
          field: ticketLocalEdit.field,
          localValue: ticketLocalEdit.localValue,
          baseJiraVersion: ticketLocalEdit.baseJiraVersion,
          isDraft: ticketLocalEdit.isDraft,
          modifiedAt: ticketLocalEdit.modifiedAt,
        }).from(ticketLocalEdit).where(inArray(ticketLocalEdit.ticketKey, keys)),
        db.select({
          jiraKey: storyVersion.jiraKey,
          contentHash: storyVersion.contentHash,
          createdAt: storyVersion.createdAt,
        }).from(storyVersion).where(inArray(storyVersion.jiraKey, keys)),
        db.select({
          ticketKey: ticketSubtask.ticketKey,
          total: sql<number>`COUNT(*)`.as("total"),
          open: sql<number>`SUM(CASE WHEN ${ticketSubtask.status} NOT IN ('DONE', 'DEPRECATED') THEN 1 ELSE 0 END)`.as("open"),
        }).from(ticketSubtask)
          .where(inArray(ticketSubtask.ticketKey, keys))
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

  // Resolve display names from the joined sprint-name cache (same source the
  // board uses), so buildTicketHoverData maps the raw sprint id to its label.
  const sprintNames: Record<string, string> = {};
  for (const { t, sprintDisplayName } of rows) {
    if (t.sprintName && sprintDisplayName) sprintNames[t.sprintName] = sprintDisplayName;
  }

  const out: Record<string, TicketPillHoverData> = {};
  for (const { t, meta } of rows) {
    if (t.type === "subtask" || t.type === "epic") continue;

    const edits = editsByKey.get(t.jiraKey) ?? [];
    const latestHash = latestHashByKey.get(t.jiraKey) ?? null;
    const editState: TicketEditState = computeTicketEditState(edits, latestHash);

    const summary: Ticket = {
      key: t.jiraKey,
      title: t.title,
      type: (t.type ?? "task") as IssueType,
      epic: t.epic ?? null,
      epicKey: t.epicKey ?? null,
      jiraStatus: (t.status ?? "TO DO") as Ticket["jiraStatus"],
      storyPoints: t.storyPoints ?? null,
      assignee: buildAssignee(t.assignee, t.assigneeAccountId),
      reporter: buildAssignee(t.reporter),
      flagged: t.flagged ?? false,
      readiness: (meta?.readiness ?? null) as TicketReadiness | null,
      poStatus: (meta?.poStatus ?? null) as Ticket["poStatus"],
      qualityScore: meta?.qualityScore ?? null,
      businessValue: meta?.businessValue ?? null,
      editState,
      notes: meta?.poNotes ?? "",
      sprintId: t.sprintName || undefined,
      openSubtaskCount: subtaskCountByKey.get(t.jiraKey)?.open ?? 0,
      totalSubtaskCount: subtaskCountByKey.get(t.jiraKey)?.total ?? 0,
    };

    out[t.jiraKey] = buildTicketHoverData(summary, sprintNames);
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withRequestLog(getHoverData);
