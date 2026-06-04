/**
 * Shared types and parsing for the Backlog Deprecation Review control center
 * (BRDG-283). The /api/cleanup route and the /cleanup view both import these so
 * the per-topic descriptor, the scan-score JSON shape, and the row contract stay
 * defined in exactly one place. Later epic stories add topics here and the rest
 * of the surface follows automatically.
 */

export type Disposition = "candidate" | "dismissed" | "confirmed" | null;

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

export interface CleanupRow {
  key: string;
  title: string;
  status: string;
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

export interface CleanupResponse {
  rows: CleanupRow[];
  total: number;
  topics: { key: ScanTopicKey; label: string; live: boolean }[];
}

export type CleanupSort =
  | "overall"
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
