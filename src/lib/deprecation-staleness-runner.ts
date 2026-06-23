/**
 * Shared Tier-1 staleness scoring runner (Backlog Deprecation Review epic).
 *
 * This is the SINGLE implementation of the per-ticket gather-and-score pass that
 * the local staleness scan performs. Both callers use it:
 *   - the rolling scheduled task `runDeprecationStalenessScan` (scheduled-tasks.ts),
 *     which selects a rotating batch and feeds those rows here, and
 *   - the on-demand `scoreStalenessForKeys` (powering POST /api/cleanup/quick-scan),
 *     which loads the eligible rows for a hand-picked set of keys and feeds them here.
 *
 * WHY one runner: the scheduled task and the quick-scan endpoint must compute
 * identical scores from identical signals (latest comment, linked-epic activity,
 * effective last activity) and write the same fields. Keeping the gather+score+
 * write loop in one place prevents the two paths from drifting apart.
 *
 * It is cheap and fully local: no AI, no Jira reads/writes. It only fills the
 * local scan-state fields (scanScores.staleness, scanOverall, scanRationale,
 * lastScannedAt) on ticketMetadata, preserving any deep-scan topic scores already
 * present in scanScores (merge, never clobber).
 */

import { db } from "@/db";
import { ticket, ticketMetadata, jiraComment } from "@/db/schema";
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { FINISHED_STATUSES, EXCLUDED_SCAN_TYPES } from "@/lib/ticket-status";
import {
  scoreStaleness,
  isPoMetadataEmpty,
  STALENESS_CANDIDATE_THRESHOLD,
  effectiveLastActivity,
} from "@/lib/deprecation-staleness";
import { parseScanScoresRaw } from "@/lib/cleanup-types";

/**
 * The row shape the scoring core needs. Mirrors the columns the scheduled task
 * already selects so the task can pass its batch rows straight through.
 */
export interface ScoreableRow {
  jiraKey: string;
  jiraUpdatedAt: string | null;
  sprintName: string | null;
  status: string | null;
  epicKey: string | null;
  scanScores: string | null;
  readiness: string | null;
  poStatus: string | null;
  qualityScore: number | null;
  effortScores: string | null;
  poNotes: string | null;
  poPriority: number | null;
  businessValue: number | null;
}

export interface StalenessScoreSummary {
  /** Number of rows scored and written. */
  scored: number;
  /** Number of rows that crossed the candidate threshold. */
  candidates: number;
}

/**
 * Score and persist staleness for the given already-eligible rows.
 *
 * Bulk-gathers the latest comment per ticket and the effective last-activity per
 * linked epic in a small number of queries (no N+1), then scores each row and
 * upserts the scan-state fields. `now` is injectable for deterministic tests.
 *
 * Returns counts only; callers add their own logging/cursor bookkeeping.
 */
export async function scoreRows(
  rows: ScoreableRow[],
  scannedAt: string,
  now: number = Date.now(),
): Promise<StalenessScoreSummary> {
  if (rows.length === 0) return { scored: 0, candidates: 0 };

  // Latest comment timestamp per ticket in one bulk query. WHY restrict to the
  // given keys: we only need comment data for the rows being scored, which keeps
  // the query cheap regardless of total backlog size.
  const keys = rows.map((r) => r.jiraKey);
  const commentRows = await db
    .select({
      ticketKey: jiraComment.ticketKey,
      latestComment: sql<string | null>`max(${jiraComment.createdAt})`.as("latest_comment"),
    })
    .from(jiraComment)
    .where(inArray(jiraComment.ticketKey, keys))
    .groupBy(jiraComment.ticketKey)
    .all();
  const lastCommentByKey = new Map(commentRows.map((r) => [r.ticketKey, r.latestComment]));

  // Effective last-activity per linked epic in one pair of bulk queries.
  // WHY include the epic's own comments: an epic can accumulate planning/review
  // comments without changing jiraUpdatedAt, so comments are a meaningful
  // activity signal for the parent too.
  const epicKeys = [...new Set(rows.map((r) => r.epicKey).filter(Boolean))] as string[];
  const epicActivityByKey = new Map<string, string | null>();
  if (epicKeys.length > 0) {
    const epicTicketRows = await db
      .select({ jiraKey: ticket.jiraKey, jiraUpdatedAt: ticket.jiraUpdatedAt })
      .from(ticket)
      .where(inArray(ticket.jiraKey, epicKeys))
      .all();

    const epicCommentRows = await db
      .select({
        ticketKey: jiraComment.ticketKey,
        latestComment: sql<string | null>`max(${jiraComment.createdAt})`.as("latest_comment"),
      })
      .from(jiraComment)
      .where(inArray(jiraComment.ticketKey, epicKeys))
      .groupBy(jiraComment.ticketKey)
      .all();
    const epicLatestComment = new Map(epicCommentRows.map((r) => [r.ticketKey, r.latestComment]));

    for (const epicRow of epicTicketRows) {
      const combined = effectiveLastActivity(
        epicRow.jiraUpdatedAt,
        epicLatestComment.get(epicRow.jiraKey) ?? null,
      );
      epicActivityByKey.set(epicRow.jiraKey, combined);
    }
  }

  let candidates = 0;
  for (const row of rows) {
    const result = scoreStaleness(
      {
        jiraUpdatedAt: row.jiraUpdatedAt,
        sprintName: row.sprintName,
        status: row.status,
        hasPoMetadata: !isPoMetadataEmpty(row),
        lastCommentAt: lastCommentByKey.get(row.jiraKey) ?? null,
        epicLastActivityAt: row.epicKey ? (epicActivityByKey.get(row.epicKey) ?? null) : null,
      },
      now,
    );

    if (result.score >= STALENESS_CANDIDATE_THRESHOLD) candidates++;

    // Preserve any deep-scan topic scores; only overwrite the staleness entry.
    const scores = parseScanScoresRaw(row.scanScores);
    scores.staleness = { score: result.score, rationale: result.rationale };

    const fields = {
      scanScores: JSON.stringify(scores),
      scanOverall: result.score,
      scanRationale: result.rationale,
      lastScannedAt: scannedAt,
    };

    // The ticket may have no metadata row yet; upsert keyed on jiraKey.
    await db
      .insert(ticketMetadata)
      .values({ jiraKey: row.jiraKey, ...fields })
      .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: fields });
  }

  return { scored: rows.length, candidates };
}

/** Columns the scoring core reads; selected by both the task and quick-scan. */
const ROW_SELECTION = {
  jiraKey: ticket.jiraKey,
  jiraUpdatedAt: ticket.jiraUpdatedAt,
  sprintName: ticket.sprintName,
  status: ticket.status,
  epicKey: ticket.epicKey,
  lastScannedAt: ticketMetadata.lastScannedAt,
  scanScores: ticketMetadata.scanScores,
  readiness: ticketMetadata.readiness,
  poStatus: ticketMetadata.poStatus,
  qualityScore: ticketMetadata.qualityScore,
  effortScores: ticketMetadata.effortScores,
  poNotes: ticketMetadata.poNotes,
  poPriority: ticketMetadata.poPriority,
  businessValue: ticketMetadata.businessValue,
} as const;

export interface ScoreStalenessForKeysResult {
  /** Number of eligible tickets that were scored. */
  scored: number;
  /** Number of requested keys that were ineligible or unknown and skipped. */
  skipped: number;
}

/**
 * Run the cheap staleness pass on demand for a specific set of ticket keys.
 *
 * Loads only the eligible rows among the requested keys (same eligibility the
 * scanners use: backlog, not removed from Jira, not finished, not subtask),
 * scores them via the shared core, and reports how many were scored vs skipped.
 * Ineligible/unknown keys are counted as skipped, not scored. `now` is injectable
 * for deterministic tests.
 */
export async function scoreStalenessForKeys(
  keys: string[],
  now: number = Date.now(),
): Promise<ScoreStalenessForKeysResult> {
  // De-dupe to count each requested key once and avoid double-scoring.
  const requested = [...new Set(keys)];
  if (requested.length === 0) return { scored: 0, skipped: 0 };

  const rows = await db
    .select(ROW_SELECTION)
    .from(ticket)
    .leftJoin(ticketMetadata, eq(ticket.jiraKey, ticketMetadata.jiraKey))
    .where(
      and(
        inArray(ticket.jiraKey, requested),
        eq(ticket.sprintName, ""),
        isNull(ticket.removedFromJiraAt),
        notInArray(ticket.status, FINISHED_STATUSES as string[]),
        // Subtasks are excluded: they are cleaned up together with their parent.
        // or(isNull) ensures null-typed tickets are not silently dropped
        // (NULL NOT IN (...) evaluates to NULL/false in SQL).
        or(isNull(ticket.type), notInArray(ticket.type, EXCLUDED_SCAN_TYPES as string[])),
      ),
    )
    .all();

  const scannedAt = new Date(now).toISOString();
  const { scored } = await scoreRows(rows, scannedAt, now);

  return { scored, skipped: requested.length - scored };
}
