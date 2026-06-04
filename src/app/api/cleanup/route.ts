import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq, and, isNull, notInArray } from "drizzle-orm";
import { FINISHED_STATUSES } from "@/lib/ticket-status";
import {
  SCAN_TOPICS,
  parseScanScores,
  type CleanupResponse,
  type CleanupRow,
  type Disposition,
} from "@/lib/cleanup-types";

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

  let rows: CleanupRow[] = eligible.map((r) => ({
    key: r.key,
    title: r.title,
    status: r.status,
    lastScannedAt: r.lastScannedAt ?? null,
    topicScores: parseScanScores(r.scanScores),
    scanOverall: r.scanOverall ?? null,
    disposition: (r.disposition ?? null) as Disposition,
    revivalScore: r.revivalScore ?? null,
    revivalRationale: r.revivalRationale ?? null,
  }));

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
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
  });
}
