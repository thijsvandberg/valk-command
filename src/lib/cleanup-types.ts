/**
 * Shared types and parsing for the Backlog Deprecation Review control center
 * (BRDG-283). The /api/cleanup route and the /cleanup view both import these so
 * the per-topic descriptor, the scan-score JSON shape, and the row contract stay
 * defined in exactly one place. Later epic stories add topics here and the rest
 * of the surface follows automatically.
 */

import type { IssueType, JiraStatus, Ticket } from "@/types/ticket";

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
  // Timestamp of the last Tier-2 deep scan, or null when the ticket has only had
  // (or not even had) the cheap Tier-1 staleness pass. Drives the "Deep-scanned"
  // filter + recency sort: this is how the PO narrows the list to items that have
  // actually had a deep dive (BRDG-298), the requested overview.
  lastDeepScannedAt: string | null;
  // Free-text rationale written by the deep-scan analyzer explaining WHY the
  // ticket was flagged. Surfaced inline under the title (truncated) so the PO can
  // read the reasoning without opening each drawer; the full text lives in the
  // DispositionPanel. null when no deep scan has produced one (BRDG-298).
  scanRationale: string | null;
  /** Per-topic score in 0..1, or null when that topic has not scored this ticket. */
  topicScores: Partial<Record<ScanTopicKey, number | null>>;
  scanOverall: number | null;
  disposition: Disposition;
  // Revival signal (BRDG-298): the OPPOSITE of deprecation. Exposed so the UI can
  // render a "worth pulling up" badge/filter. null when no analyzer has run.
  revivalScore: number | null;
  revivalRationale: string | null;
}

/**
 * Projects a cleanup row into a lightweight Ticket so the shared sprint-board row
 * (BoardRow) can render the cleanup list (BRDG-389), mirroring `epicChildToTicket`.
 *
 * The cleanup list feeds ALL of its metadata through BoardRow's `metadataSlot` and
 * passes an empty `tags` set, so BoardRow renders no native metadata of its own. That
 * is why `sprintId` is intentionally omitted (the sprint chip is shown by the slot's
 * own SprintOrBacklogBadge, not the row's native chip) and the planning fields default
 * to clean/empty: nothing here drives the resting list, only the panel/hover read it.
 *
 * Distinct from the in-page `rowToTicket`, which is the SidePanel adapter and carries
 * different sprint semantics (sprintDisplayName for the panel header).
 */
export function cleanupRowToTicket(row: CleanupRow): Ticket {
  return {
    key: row.key,
    title: row.title,
    type: row.type,
    epic: row.epic,
    epicKey: row.epicKey,
    // `||` (not `??`) so an empty-string status also falls back, avoiding a blank
    // status pill on the BoardRow.
    jiraStatus: (row.status || "TO DO") as JiraStatus,
    storyPoints: row.storyPoints,
    assignee: row.assignee,
    reporter: row.reporter,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
    jiraUpdatedAt: row.jiraUpdatedAt,
    sprintDisplayName: row.sprintName,
    openSubtaskCount: row.openSubtaskCount,
    totalSubtaskCount: row.totalSubtaskCount,
  };
}

// Distinct option lists for the view's dropdown filters, computed server-side so
// the controls list every value present in the eligible backlog (not just the
// page's current sort window). Epics carry both key + name; people are bare names.
export interface CleanupFacets {
  types: IssueType[];
  epics: { key: string; name: string }[];
  assignees: string[];
  reporters: string[];
  // Distinct sprint placements across the eligible set. The empty/backlog case is
  // represented by BACKLOG_FACET_VALUE so it reads as a real option in the
  // dropdown (BRDG-298). Scan eligibility is backlog-only today, so this usually
  // holds just "Backlog"; still computed so it widens correctly if scope changes.
  sprints: string[];
}

// Sentinel option value for the "no sprint" (backlog) case in the sprint facet
// and filter. The empty sprintName maps to this so the dropdown shows a real
// "Backlog" choice instead of a blank entry, consistent with SprintOrBacklogBadge.
export const BACKLOG_FACET_VALUE = "__backlog__";
export const BACKLOG_FACET_LABEL = "Backlog";

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
  // Most-recently deep-scanned first; never-deep-scanned rows sink to the bottom.
  | "deepScanned-newest"
  | "key";

// "deep" narrows to rows that have had a Tier-2 deep scan (lastDeepScannedAt set):
// the requested "items that have actually had a deep dive" overview (BRDG-298).
export type ScannedFilter = "all" | "scanned" | "never" | "deep";

/**
 * Parse the stored scanScores JSON into a raw per-topic object. Bad or missing
 * JSON (and non-object payloads) degrade to an empty object rather than throwing,
 * so one corrupt row never takes down a scan or list. Callers that merge or read
 * arbitrary topic keys use this; parseScanScores narrows it to the number map.
 */
export function parseScanScoresRaw(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  return parsed as Record<string, unknown>;
}

/**
 * Parse the stored scanScores JSON into a defensive per-topic number map. Bad or
 * missing JSON degrades to an empty map rather than throwing, so one corrupt row
 * never takes down the whole list.
 */
export function parseScanScores(raw: string | null | undefined): Partial<Record<ScanTopicKey, number | null>> {
  const out: Partial<Record<ScanTopicKey, number | null>> = {};
  const map = parseScanScoresRaw(raw);
  for (const topic of SCAN_TOPICS) {
    const entry = map[topic.key];
    if (entry && typeof entry === "object" && typeof (entry as ScanTopicScore).score === "number") {
      out[topic.key] = (entry as ScanTopicScore).score;
    }
  }
  return out;
}
