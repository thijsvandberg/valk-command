/**
 * Pure verdict logic for the "duplication / superseded" deep-scan topic
 * (BRDG-286). Kept separate from the scorer/DB/agent plumbing so the decision
 * rule is unit-testable in isolation (see superseded-topic.test.ts).
 *
 * See docs/plans/2026-06-04-backlog-deprecation-review-epic.md, topic #3.
 *
 * The rule, in one sentence: a ticket is "likely superseded" when it strongly
 * overlaps a SURVIVING ticket — one that is NEWER or currently ACTIVE — because
 * in a duplicate pair the obsolete one is the older / un-touched of the two. We
 * deliberately bias AGAINST flagging the survivor: if the only high-overlap
 * match is older and this ticket is the newer/active one, we abstain.
 */

// Overlap score (find-related is 0..100) at/above which two tickets are treated
// as the same work. Below this, an overlap is "related" but not a duplicate, so
// it never drives a superseded verdict on its own.
export const HIGH_OVERLAP_THRESHOLD = 70;

// Statuses that count as "still untouched in the backlog". Case-insensitive.
// Mirrors deprecation-staleness so the two topics read the workflow the same way.
const BACKLOG_LIKE_STATUSES = new Set([
  "backlog",
  "to do",
  "todo",
  "open",
  "new",
  "selected for development",
]);

// Statuses that count as "finished / closed". A done match is NOT a survivor:
// if the other ticket is already done, this one being a duplicate is a separate
// (already-built) signal, not a superseded-by-an-active-ticket signal.
const DONE_LIKE_STATUSES = new Set([
  "done",
  "closed",
  "resolved",
  "complete",
  "completed",
  "cancelled",
  "canceled",
  "won't do",
  "wont do",
  "rejected",
]);

/** A find-related match enriched with the match ticket's own recency, if known. */
export interface SupersededMatch {
  /** The matched ticket key, e.g. "BT-123". */
  key: string;
  /** find-related overlap score, 0..100. */
  score: number;
  /** Matched ticket title (for evidence). */
  title: string;
  /** Matched ticket current status. */
  status: string;
  /** Why find-related thinks they overlap (for evidence + rationale). */
  reason: string | null;
  /**
   * Matched ticket's Jira last-updated ISO timestamp, when the match ticket is
   * present in the local DB. Null when unknown (e.g. not yet synced) — recency
   * then falls back to status alone.
   */
  jiraUpdatedAt: string | null;
}

export interface SupersededVerdictInput {
  /** This (the candidate) ticket's last-updated ISO timestamp. */
  ticketUpdatedAt: string | null;
  /** This ticket's current status. */
  ticketStatus: string;
  /** Top find-related matches for this ticket. */
  matches: SupersededMatch[];
}

export interface SupersededVerdict {
  score: number;
  evidence: {
    /** The survivor key the PO can open from the review screen (BRDG-289). */
    supersededBy: string;
    /** Overlap score 0..100 from find-related. */
    overlapScore: number;
    /** find-related's reason for the overlap. */
    matchReason: string | null;
    /** Survivor status at scan time. */
    matchStatus: string;
    /** Why this match qualified as a survivor: newer, active, or both. */
    survivorBasis: ("newer" | "active")[];
  };
  rationale: string;
}

function isActive(status: string): boolean {
  const s = status.trim().toLowerCase();
  if (s === "") return false;
  // Active = in flight: not still in the backlog and not finished.
  return !BACKLOG_LIKE_STATUSES.has(s) && !DONE_LIKE_STATUSES.has(s);
}

/** Returns true when the match ticket is strictly newer than this ticket. */
function isNewer(matchUpdatedAt: string | null, ticketUpdatedAt: string | null): boolean {
  if (!matchUpdatedAt || !ticketUpdatedAt) return false;
  const m = Date.parse(matchUpdatedAt);
  const t = Date.parse(ticketUpdatedAt);
  if (Number.isNaN(m) || Number.isNaN(t)) return false;
  return m > t;
}

/**
 * Map find-related output into a superseded verdict, or null to abstain.
 *
 * Abstains when there is no high-overlap match that is also a survivor (newer or
 * active). The strongest qualifying survivor (highest overlap) wins. The score
 * scales from the overlap and is lifted when BOTH newer and active corroborate.
 */
export function deriveSupersededVerdict(
  input: SupersededVerdictInput,
): SupersededVerdict | null {
  const candidates = input.matches
    .filter((m) => m.score >= HIGH_OVERLAP_THRESHOLD)
    .map((m) => {
      const basis: ("newer" | "active")[] = [];
      if (isNewer(m.jiraUpdatedAt, input.ticketUpdatedAt)) basis.push("newer");
      if (isActive(m.status)) basis.push("active");
      return { match: m, basis };
    })
    // A survivor must be newer or active. An OLDER, non-active match means THIS
    // ticket is the survivor, so it must not flag this ticket.
    .filter((c) => c.basis.length > 0)
    // Prefer the strongest overlap; tie-break toward more corroboration.
    .sort((a, b) => b.match.score - a.match.score || b.basis.length - a.basis.length);

  const best = candidates[0];
  if (!best) return null;

  // Base confidence from overlap (70 -> 0.7 ... 100 -> 1.0), then lift a little
  // when both recency and activity agree. Cap at 1.
  const overlapFraction = Math.min(1, best.match.score / 100);
  const corroborationBonus = best.basis.length > 1 ? 0.1 : 0;
  const score = Math.min(1, overlapFraction + corroborationBonus);

  return {
    score,
    evidence: {
      supersededBy: best.match.key,
      overlapScore: best.match.score,
      matchReason: best.match.reason,
      matchStatus: best.match.status,
      survivorBasis: best.basis,
    },
    rationale: `Likely superseded by ${best.match.key}`,
  };
}
