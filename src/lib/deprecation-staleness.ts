/**
 * Tier-1 staleness scorer for the Backlog Deprecation Review epic (BRDG-297).
 *
 * Pure, deterministic, no-AI heuristic over already-synced local ticket data.
 * It ranks how likely a backlog ticket is obsolete based on cheap local signals
 * only: effective last activity (Jira update OR most-recent comment), whether
 * it was ever scheduled into a sprint, whether it is still sitting in a
 * backlog-like status, and whether the PO has put any preparation metadata on
 * it. The output feeds the rolling scan and later the deep-dive selection; it
 * never writes to Jira.
 *
 * Follow-up enhancement (2026-06-05, BRDG-297): extended to account for comment
 * activity and linked-epic activity. See "Follow-up" section in story doc.
 */

// Age thresholds (days). Below the floor a ticket contributes no age staleness;
// at/above the ceiling it contributes the full age weight. WHY a ramp instead
// of a flag: recently-touched tickets should never look stale, while the signal
// should saturate rather than grow unbounded for ancient tickets.
const AGE_FLOOR_DAYS = 90;
const AGE_CEILING_DAYS = 540;

// Component weights. They sum to 1 so the combined score is already normalized
// to 0..1 without a separate clamp on the happy path.
const WEIGHT_AGE = 0.5;
const WEIGHT_NEVER_IN_SPRINT = 0.25;
const WEIGHT_BACKLOG_STATUS = 0.15;
const WEIGHT_EMPTY_METADATA = 0.1;

// Score at/above which a ticket is worth surfacing as a deprecation candidate.
export const STALENESS_CANDIDATE_THRESHOLD = 0.6;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Epic dampener: if the linked epic (or its own comments) has been active within
// this window, the ticket is likely still relevant because the parent work is
// ongoing. Six months is conservative — active epics typically touch their
// children at review/planning; 6 months is long enough to capture a slow epic
// while still flagging tickets under truly dormant parents.
const EPIC_ACTIVE_WINDOW_DAYS = 180;

// Maximum fraction of the age weight that the epic dampener can subtract.
// WHY a cap: epic activity is a soft, indirect signal — it nudges rather than
// overrides. A ticket under an active epic might still be stale itself; we want
// to lower its priority, not hide it entirely.
const EPIC_DAMPENER_MAX_FRACTION = 0.4;

// Statuses that count as "still in the backlog / not picked up". Compared
// case-insensitively. WHY a list: Jira workflows vary, but these cover the
// untouched-work states; anything in progress or done is not backlog-stale.
const BACKLOG_LIKE_STATUSES = new Set([
  "backlog",
  "to do",
  "todo",
  "open",
  "new",
  "selected for development",
]);

export interface StalenessInput {
  /** Jira's last-updated ISO timestamp (ticket.jiraUpdatedAt). */
  jiraUpdatedAt: string | null | undefined;
  /** Local sprint marker: "" (or null) means the ticket is in the backlog. */
  sprintName: string | null | undefined;
  /** Current Jira status (ticket.status). */
  status: string | null | undefined;
  /** Whether the PO has added any preparation metadata to the ticket. */
  hasPoMetadata: boolean;
  /**
   * ISO timestamp of the most recent comment on this ticket (from jiraComment).
   * When present the effective last-activity timestamp becomes
   * max(jiraUpdatedAt, lastCommentAt), so a recently-commented ticket is not
   * penalised for an old jiraUpdatedAt. Null/undefined falls back to
   * jiraUpdatedAt only.
   */
  lastCommentAt?: string | null;
  /**
   * ISO timestamp of the linked epic's effective last activity
   * (max of the epic ticket's jiraUpdatedAt and its own latest comment).
   * When the epic has been active within EPIC_ACTIVE_WINDOW_DAYS the age
   * component is dampened: an actively-worked epic suggests its backlog
   * children are still in play, but we only nudge, we do not zero the score.
   * Null/undefined disables the dampener (safe fallback).
   */
  epicLastActivityAt?: string | null;
}

export interface StalenessResult {
  /** Normalized 0..1 staleness score. */
  score: number;
  /** Plain English explanation assembled from whichever signals fired. */
  rationale: string;
}

/**
 * Convenience helper: true when none of the PO preparation fields are set.
 * Kept separate so the scorer stays a pure function of plain inputs and the
 * "what counts as empty metadata" rule lives in one place.
 */
export function isPoMetadataEmpty(meta: {
  readiness?: string | null;
  poStatus?: string | null;
  qualityScore?: number | null;
  effortScores?: string | null;
  poNotes?: string | null;
  poPriority?: number | null;
  businessValue?: number | null;
}): boolean {
  return (
    !meta.readiness &&
    !meta.poStatus &&
    meta.qualityScore == null &&
    !meta.effortScores &&
    !meta.poNotes &&
    meta.poPriority == null &&
    meta.businessValue == null
  );
}

/**
 * Compute effective last-activity timestamp as the more recent of jiraUpdatedAt
 * and lastCommentAt. Returns null when neither is available, which the scorer
 * treats as maximally stale.
 */
export function effectiveLastActivity(
  jiraUpdatedAt: string | null | undefined,
  lastCommentAt: string | null | undefined,
): string | null {
  const candidates: string[] = [];
  if (jiraUpdatedAt) candidates.push(jiraUpdatedAt);
  if (lastCommentAt) candidates.push(lastCommentAt);
  if (candidates.length === 0) return null;
  // ISO strings sort lexicographically — max = most recent.
  return candidates.reduce((a, b) => (a > b ? a : b));
}

function ageInDays(timestamp: string | null | undefined, now: number): number | null {
  if (!timestamp) return null;
  const updated = new Date(timestamp).getTime();
  if (Number.isNaN(updated)) return null;
  return Math.max(0, (now - updated) / MS_PER_DAY);
}

function formatMonth(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "an unknown date";
  // e.g. "2024-03"; intentionally coarse so the rationale stays stable.
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Score a single ticket's staleness. `now` is injectable for deterministic tests.
 */
export function scoreStaleness(input: StalenessInput, now: number = Date.now()): StalenessResult {
  const reasons: string[] = [];
  let score = 0;

  // Effective last activity: the more recent of jiraUpdatedAt and the latest
  // local comment. A comment on a backlog ticket is genuine team engagement, so
  // treating the ticket as inactive when only jiraUpdatedAt is old is wrong.
  const lastActivity = effectiveLastActivity(input.jiraUpdatedAt, input.lastCommentAt);

  // Age / inactivity (ramped contribution based on effective last activity).
  const days = ageInDays(lastActivity, now);
  let ageContribution = 0;

  if (days == null) {
    // Unknown update time is treated as maximally stale: a ticket with no
    // timestamp has effectively shown no recent activity.
    ageContribution = WEIGHT_AGE;
    reasons.push("No recorded activity date");
  } else if (days >= AGE_FLOOR_DAYS) {
    const ramp = Math.min(
      1,
      (days - AGE_FLOOR_DAYS) / (AGE_CEILING_DAYS - AGE_FLOOR_DAYS),
    );
    ageContribution = WEIGHT_AGE * ramp;
    reasons.push(`No activity since ${formatMonth(lastActivity as string)}`);
  }

  // Epic dampener: if the linked epic has been active recently its children are
  // likely still in play. We reduce the age contribution proportionally to how
  // recent the epic activity is, capped at EPIC_DAMPENER_MAX_FRACTION of
  // WEIGHT_AGE so this never fully masks age staleness.
  //
  // WHY only dampen, never zero: the dampener is a soft signal — an active epic
  // could simply be a large ongoing effort that never revisits its backlog. A
  // cap of 40 % of the age weight ensures the ticket still surfaces if the
  // other signals are strong.
  if (ageContribution > 0 && input.epicLastActivityAt) {
    const epicDays = ageInDays(input.epicLastActivityAt, now);
    if (epicDays != null && epicDays < EPIC_ACTIVE_WINDOW_DAYS) {
      // Freshness ratio: 0 when the epic was active today, 1 when it just
      // crossed the window boundary. We flip it: more recent = bigger reduction.
      const freshness = 1 - epicDays / EPIC_ACTIVE_WINDOW_DAYS;
      const reduction = Math.min(
        ageContribution * EPIC_DAMPENER_MAX_FRACTION,
        WEIGHT_AGE * EPIC_DAMPENER_MAX_FRACTION * freshness,
      );
      ageContribution = Math.max(0, ageContribution - reduction);
      reasons.push("linked epic recently active (dampened)");
    }
  }

  score += ageContribution;

  // Never scheduled into a sprint (backlog marker is empty/null sprintName).
  const inBacklog = !input.sprintName;
  if (inBacklog) {
    score += WEIGHT_NEVER_IN_SPRINT;
    reasons.push("never in a sprint");
  }

  // Still in a backlog-like status.
  const status = (input.status ?? "").trim().toLowerCase();
  if (BACKLOG_LIKE_STATUSES.has(status)) {
    score += WEIGHT_BACKLOG_STATUS;
    reasons.push(`still ${input.status}`);
  }

  // No PO preparation metadata.
  if (input.hasPoMetadata === false) {
    score += WEIGHT_EMPTY_METADATA;
    reasons.push("no PO metadata");
  }

  const clamped = Math.min(1, Math.max(0, score));
  const rationale = reasons.length > 0
    ? reasons.join("; ")
    : "Recently active; no staleness signals";

  return { score: clamped, rationale };
}
