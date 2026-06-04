/**
 * Tier-1 staleness scorer for the Backlog Deprecation Review epic (BRDG-282).
 *
 * Pure, deterministic, no-AI heuristic over already-synced local ticket data.
 * It ranks how likely a backlog ticket is obsolete based on cheap local signals
 * only: how long since Jira last touched it, whether it was ever scheduled into
 * a sprint, whether it is still sitting in a backlog-like status, and whether
 * the PO has put any preparation metadata on it. The output feeds the rolling
 * scan and later the deep-dive selection; it never writes to Jira.
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

function ageInDays(jiraUpdatedAt: string | null | undefined, now: number): number | null {
  if (!jiraUpdatedAt) return null;
  const updated = new Date(jiraUpdatedAt).getTime();
  if (Number.isNaN(updated)) return null;
  return Math.max(0, (now - updated) / MS_PER_DAY);
}

function formatMonth(jiraUpdatedAt: string): string {
  const d = new Date(jiraUpdatedAt);
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

  // Age / inactivity (ramped contribution).
  const days = ageInDays(input.jiraUpdatedAt, now);
  if (days == null) {
    // Unknown update time is treated as maximally stale: a ticket with no
    // timestamp has effectively shown no recent activity.
    score += WEIGHT_AGE;
    reasons.push("No recorded activity date");
  } else if (days >= AGE_FLOOR_DAYS) {
    const ramp = Math.min(
      1,
      (days - AGE_FLOOR_DAYS) / (AGE_CEILING_DAYS - AGE_FLOOR_DAYS),
    );
    score += WEIGHT_AGE * ramp;
    reasons.push(`No activity since ${formatMonth(input.jiraUpdatedAt as string)}`);
  }

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
