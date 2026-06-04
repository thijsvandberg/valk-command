/**
 * Shared types and parsing for the Backlog Deprecation Review control center
 * (BRDG-283). The /api/cleanup route and the /cleanup view both import these so
 * the per-topic descriptor, the scan-score JSON shape, and the row contract stay
 * defined in exactly one place. Later epic stories add topics here and the rest
 * of the surface follows automatically.
 */

import type { IssueType } from "@/types/ticket";

export type Disposition = "candidate" | "dismissed" | "confirmed" | null;

// Revival score at/above which a ticket is surfaced as "worth pulling up"
// (BRDG-298). The opposite conclusion from deprecation: a low-backlog ticket
// that is still high value and fits recent/planned sprint work. Lives here (a
// dependency-free, client-safe module) so both the client view and the
// server-only scoring code can import it without dragging "server-only" into
// the client bundle.
export const REVIVAL_CANDIDATE_THRESHOLD = 0.6;

// Scheduler task names for the three deprecation scans, surfaced as on/off + run
// now controls on /cleanup (BRDG-298). Client-safe constants so the view can
// reference the tasks without importing scheduler internals (server-only).
// All three default OFF; nothing scans continuously unless the PO opts in.
export const DEPRECATION_SCAN_TASKS = {
  staleness: "deprecation-staleness-scan",
  deepScan: "deprecation-deep-scan",
  autoEnqueue: "deprecation-auto-enqueue",
} as const;

// Scoring topics from the epic. `live` flags whether a story has shipped the
// scorer that populates this topic yet; until then the column renders a "—"
// placeholder. WHY keep dormant topics in the list: the columns must exist from
// day one so the screen layout does not shift as each scorer lands.
export const SCAN_TOPICS = [
  { key: "staleness", label: "Staleness", live: true },
  { key: "replaced", label: "Replaced area", live: true },
  { key: "duplicate", label: "Duplicate", live: true },
  { key: "alreadyBuilt", label: "Already built", live: true },
  { key: "relevance", label: "Relevance decay", live: true },
] as const;

export type ScanTopicKey = (typeof SCAN_TOPICS)[number]["key"];

// One topic's entry inside the persisted scanScores JSON map. Tier-1 writes only
// `score` + `evidence` for staleness today; the field set is intentionally loose
// so later topics can attach their own evidence (e.g. supersededBy, keywords)
// without a schema change.
export interface ScanTopicScore {
  score: number;
  evidence?: string;
  [extra: string]: unknown;
}

export type ScanScores = Partial<Record<ScanTopicKey, ScanTopicScore>>;

// A row's person reference (assignee/reporter). Name plus the precomputed
// initials + colour the shared Avatar/pill use, so the client renders a person
// without re-deriving anything and without importing server-only helpers.
export interface CleanupPerson {
  name: string;
  initials: string;
  color: string;
}

export interface CleanupRow {
  key: string;
  title: string;
  status: string;
  // Issue type (story/task/bug/...). Drives the leading type icon and the
  // issue-type filter (BRDG-298 UI refresh). Falls back to "story" when Jira
  // never set one, matching the rest of the app's default.
  type: IssueType;
  // Epic the ticket belongs to: display name + key. Both null when unparented.
  epic: string | null;
  epicKey: string | null;
  storyPoints: number | null;
  // Sprint the ticket sits in, or null when it lives in the backlog. Scan
  // eligibility is backlog-only today (empty sprint), so this reads null/Backlog
  // for every current row; exposed so the row can show a sprint/backlog indicator
  // and stays correct if eligibility ever widens beyond the backlog (BRDG-298).
  sprintName: string | null;
  // Open / total subtask counts for the shared subtask-count badge.
  openSubtaskCount: number;
  totalSubtaskCount: number;
  // Child-story count for epics: the number of eligible backlog tickets whose
  // epicKey points at this epic. 0 for non-epics. Drives the "N stories" badge so
  // an epic row communicates its scope at a glance (BRDG-298).
  epicChildCount: number;
  assignee: CleanupPerson | null;
  reporter: CleanupPerson | null;
  // Last Jira activity timestamp (ticket.jiraUpdatedAt). Drives the
  // last-activity time-period filter buckets. null when never recorded.
  jiraUpdatedAt: string | null;
  lastScannedAt: string | null;
  /** Per-topic score in 0..1, or null when that topic has not scored this ticket. */
  topicScores: Partial<Record<ScanTopicKey, number | null>>;
  scanOverall: number | null;
  disposition: Disposition;
  // Revival signal (BRDG-298): the OPPOSITE of deprecation. Exposed so the UI can
  // render a "worth pulling up" badge/filter. null when no analyzer has run.
  revivalScore: number | null;
  revivalRationale: string | null;
}

// Distinct option lists for the view's dropdown filters, computed server-side so
// the controls list every value present in the eligible backlog (not just the
// page's current sort window). Epics carry both key + name; people are bare names.
export interface CleanupFacets {
  types: IssueType[];
  epics: { key: string; name: string }[];
  assignees: string[];
  reporters: string[];
}

export interface CleanupResponse {
  rows: CleanupRow[];
  total: number;
  topics: { key: ScanTopicKey; label: string; live: boolean }[];
  facets: CleanupFacets;
}

export type CleanupSort =
  | "overall"
  | "revival"
  | "staleness"
  | "lastScanned-oldest"
  | "lastScanned-newest"
  | "key";

export type ScannedFilter = "all" | "scanned" | "never";

/**
 * Parse the stored scanScores JSON into a defensive per-topic number map. Bad or
 * missing JSON degrades to an empty map rather than throwing, so one corrupt row
 * never takes down the whole list.
 */
export function parseScanScores(raw: string | null | undefined): Partial<Record<ScanTopicKey, number | null>> {
  const out: Partial<Record<ScanTopicKey, number | null>> = {};
  if (!raw) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== "object") return out;
  const map = parsed as Record<string, unknown>;
  for (const topic of SCAN_TOPICS) {
    const entry = map[topic.key];
    if (entry && typeof entry === "object" && typeof (entry as ScanTopicScore).score === "number") {
      out[topic.key] = (entry as ScanTopicScore).score;
    }
  }
  return out;
}
