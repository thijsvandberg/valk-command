import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata, ticketSubtask } from "@/db/schema";
import { eq, and, isNull, notInArray, sql } from "drizzle-orm";
import { FINISHED_STATUSES, isFinishedStatus } from "@/lib/ticket-status";
import { userInitials, userColor } from "@/lib/user-utils";
import {
  SCAN_TOPICS,
  parseScanScores,
  type CleanupResponse,
  type CleanupRow,
  type CleanupFacets,
  type CleanupPerson,
  type Disposition,
} from "@/lib/cleanup-types";
import type { IssueType } from "@/types/ticket";

const ISSUE_TYPES: ReadonlySet<IssueType> = new Set([
  "task",
  "bug",
  "story",
  "subtask",
  "spike",
  "epic",
]);

// Normalise Jira's free-text issue type onto our enum; default to "story" so a
// missing/unknown type still renders a sane leading icon (matches the rest of
// the app, which treats unparented backlog items as stories).
function normaliseType(raw: string | null): IssueType {
  const t = (raw ?? "").toLowerCase();
  return ISSUE_TYPES.has(t as IssueType) ? (t as IssueType) : "story";
}

// Person reference with the same initials + colour the shared Avatar derives, so
// the client renders without re-computing and without importing server-only code.
function toPerson(name: string | null): CleanupPerson | null {
  if (!name) return null;
  return { name, initials: userInitials(name), color: userColor(name) };
}

// Sort/filter are applied here as well as client-side: the API gives a sensible
// default ordering and lets callers narrow the (potentially large) backlog before
// it crosses the wire, while the client re-applies the same intent for instant
// re-ordering of the already-loaded list.
const VALID_SORTS = new Set([
  "overall",
  "staleness",
  "lastScanned-oldest",
  "lastScanned-newest",
  "key",
]);
const VALID_DISPOSITIONS = new Set(["candidate", "dismissed", "confirmed", "none"]);

function cmpNullableDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const sortParam = searchParams.get("sort") ?? "overall";
  const sort = VALID_SORTS.has(sortParam) ? sortParam : "overall";

  // scanned = scanned | never | all (default all)
  const scanned = searchParams.get("scanned") ?? "all";
  // disposition = candidate | dismissed | confirmed | none | all (default all)
  const dispositionFilter = searchParams.get("disposition") ?? "all";
  const minOverallRaw = Number(searchParams.get("minOverall") ?? "0");
  const minOverall = Number.isFinite(minOverallRaw) ? Math.max(0, Math.min(1, minOverallRaw)) : 0;

  // Scan-eligible = the SAME definition the Tier-1 scanner uses for "backlog":
  // empty sprintName, not removed from Jira, and not a finished status.
  // Finished tickets (DONE, DEPRECATED, etc.) are excluded because they are
  // irrelevant to deprecation review: the work was already resolved.
  const eligible = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      status: ticket.status,
      type: ticket.type,
      epic: ticket.epic,
      epicKey: ticket.epicKey,
      storyPoints: ticket.storyPoints,
      assignee: ticket.assignee,
      reporter: ticket.reporter,
      jiraUpdatedAt: ticket.jiraUpdatedAt,
      lastScannedAt: ticketMetadata.lastScannedAt,
      scanScores: ticketMetadata.scanScores,
      scanOverall: ticketMetadata.scanOverall,
      disposition: ticketMetadata.disposition,
      revivalScore: ticketMetadata.revivalScore,
      revivalRationale: ticketMetadata.revivalRationale,
    })
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(
      and(
        eq(ticket.sprintName, ""),
        isNull(ticket.removedFromJiraAt),
        notInArray(ticket.status, FINISHED_STATUSES as string[]),
      ),
    );

  // Subtask open/total counts in one grouped query rather than N per-row reads.
  // status is the subtask's own status; "open" = anything not in a finished set.
  const subtaskRows = await db
    .select({
      ticketKey: ticketSubtask.ticketKey,
      status: ticketSubtask.status,
      n: sql<number>`count(*)`,
    })
    .from(ticketSubtask)
    .groupBy(ticketSubtask.ticketKey, ticketSubtask.status);

  const subtaskCounts = new Map<string, { open: number; total: number }>();
  for (const s of subtaskRows) {
    const entry = subtaskCounts.get(s.ticketKey) ?? { open: 0, total: 0 };
    entry.total += s.n;
    if (!isFinishedStatus(s.status)) entry.open += s.n;
    subtaskCounts.set(s.ticketKey, entry);
  }

  let rows: CleanupRow[] = eligible.map((r) => {
    const counts = subtaskCounts.get(r.key) ?? { open: 0, total: 0 };
    return {
      key: r.key,
      title: r.title,
      status: r.status,
      type: normaliseType(r.type),
      epic: r.epic ?? null,
      epicKey: r.epicKey ?? null,
      storyPoints: r.storyPoints ?? null,
      openSubtaskCount: counts.open,
      totalSubtaskCount: counts.total,
      assignee: toPerson(r.assignee),
      reporter: toPerson(r.reporter),
      jiraUpdatedAt: r.jiraUpdatedAt ?? null,
      lastScannedAt: r.lastScannedAt ?? null,
      topicScores: parseScanScores(r.scanScores),
      scanOverall: r.scanOverall ?? null,
      disposition: (r.disposition ?? null) as Disposition,
      revivalScore: r.revivalScore ?? null,
      revivalRationale: r.revivalRationale ?? null,
    };
  });

  // Facets are derived from the full eligible set (before the narrowing filters
  // below) so every dropdown lists all values present in the backlog, regardless
  // of the current sort/filter window. The client's own filters then operate over
  // the loaded rows.
  const facets = buildFacets(rows);

  // -- Filters --
  if (scanned === "scanned") rows = rows.filter((r) => r.lastScannedAt != null);
  else if (scanned === "never") rows = rows.filter((r) => r.lastScannedAt == null);

  if (dispositionFilter !== "all" && VALID_DISPOSITIONS.has(dispositionFilter)) {
    const want = dispositionFilter === "none" ? null : dispositionFilter;
    rows = rows.filter((r) => r.disposition === want);
  }

  if (minOverall > 0) {
    rows = rows.filter((r) => r.scanOverall != null && r.scanOverall >= minOverall);
  }

  // -- Sort --
  switch (sort) {
    case "overall":
      rows.sort((a, b) => cmpNullableDesc(a.scanOverall, b.scanOverall));
      break;
    case "staleness":
      rows.sort((a, b) => cmpNullableDesc(a.topicScores.staleness ?? null, b.topicScores.staleness ?? null));
      break;
    case "lastScanned-oldest":
      rows.sort((a, b) => {
        if (a.lastScannedAt == null && b.lastScannedAt == null) return 0;
        if (a.lastScannedAt == null) return 1;
        if (b.lastScannedAt == null) return -1;
        return a.lastScannedAt.localeCompare(b.lastScannedAt);
      });
      break;
    case "lastScanned-newest":
      rows.sort((a, b) => {
        if (a.lastScannedAt == null && b.lastScannedAt == null) return 0;
        if (a.lastScannedAt == null) return 1;
        if (b.lastScannedAt == null) return -1;
        return b.lastScannedAt.localeCompare(a.lastScannedAt);
      });
      break;
    case "key":
      rows.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
      break;
  }

  const body: CleanupResponse = {
    rows,
    total: rows.length,
    topics: SCAN_TOPICS.map((t) => ({ key: t.key, label: t.label, live: t.live })),
    facets,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
  });
}

// Build the distinct dropdown option lists from the eligible rows. Types sort by
// a stable display order; epics by name; people alphabetically. Empty values are
// skipped so an "unassigned" ticket does not spawn a blank option.
function buildFacets(rows: CleanupRow[]): CleanupFacets {
  const TYPE_ORDER: IssueType[] = ["story", "task", "bug", "spike", "subtask", "epic"];
  const types = new Set<IssueType>();
  const epics = new Map<string, string>(); // epicKey -> name
  const assignees = new Set<string>();
  const reporters = new Set<string>();

  for (const r of rows) {
    types.add(r.type);
    if (r.epicKey) epics.set(r.epicKey, r.epic ?? r.epicKey);
    if (r.assignee) assignees.add(r.assignee.name);
    if (r.reporter) reporters.add(r.reporter.name);
  }

  return {
    types: TYPE_ORDER.filter((t) => types.has(t)),
    epics: [...epics.entries()]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    assignees: [...assignees].sort((a, b) => a.localeCompare(b)),
    reporters: [...reporters].sort((a, b) => a.localeCompare(b)),
  };
}
