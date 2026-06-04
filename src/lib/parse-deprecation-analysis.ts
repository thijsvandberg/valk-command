/**
 * Parser for the VRW `analyze-deprecation` skill's structured output (BRDG-298,
 * see docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * The skill emits a single `<deprecation-analysis>` XML block with a JSON body
 * covering every deprecation topic plus a NEW `revival` assessment (the opposite
 * conclusion: a low-backlog ticket worth pulling up because it fits recent or
 * planned work). This parser turns that block into a typed object.
 *
 * WHY robust-not-strict: this runs in the server-side deep scan where a single
 * malformed agent response must never sink the whole batch. Every field is
 * optional in the wire format; the parser fills safe defaults, clamps scores to
 * 0..1, and NEVER throws. A missing/unparseable block returns null so the caller
 * can degrade gracefully (fall back to the per-topic scorers).
 *
 * Topic keys mirror SCAN_TOPICS in cleanup-types.ts so the parsed map drops
 * straight into scanScores.
 */
import type { ScanTopicKey } from "@/lib/cleanup-types";

/** One topic's parsed verdict. `evidence`/`supersededBy` are optional context. */
export interface ParsedTopic {
  /** 0..1, clamped. */
  score: number;
  rationale: string;
  /** Free-text proof (matched area, file path, product note). */
  evidence?: string;
  /** Only meaningful for `duplicate`: the survivor ticket key. */
  supersededBy?: string;
}

export interface ParsedRevival {
  /** 0..1, clamped. */
  score: number;
  rationale: string;
  /** Related ticket key(s) the ticket complements (recent/active/planned work). */
  relatedKeys: string[];
}

export interface ParsedDeprecationAnalysis {
  /** Target ticket key, when the skill echoed it back. */
  key: string | null;
  /** Per-topic verdicts, keyed by SCAN_TOPICS key. Only present topics appear. */
  topics: Partial<Record<ScanTopicKey, ParsedTopic>>;
  revival: ParsedRevival;
  summary: string;
}

const TOPIC_KEYS: ScanTopicKey[] = [
  "staleness",
  "replaced",
  "duplicate",
  "alreadyBuilt",
  "relevance",
];

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseTopic(raw: unknown): ParsedTopic | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const topic: ParsedTopic = {
    score: clampScore(obj.score),
    rationale: asString(obj.rationale),
  };
  const evidence = asString(obj.evidence);
  if (evidence) topic.evidence = evidence;
  const supersededBy = asString(obj.supersededBy);
  if (supersededBy) topic.supersededBy = supersededBy;
  return topic;
}

function parseRevival(raw: unknown): ParsedRevival {
  const empty: ParsedRevival = { score: 0, rationale: "", relatedKeys: [] };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  // The skill names the field revivalScore; accept a bare `score` too.
  const score = clampScore(obj.revivalScore ?? obj.score);
  const rationale = asString(obj.rationale);
  const relatedKeys = Array.isArray(obj.relatedKeys)
    ? obj.relatedKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim())
    : [];
  return { score, rationale, relatedKeys };
}

/**
 * Extract and parse the `<deprecation-analysis>` block from agent output.
 * Returns null when the block is absent or its JSON is unparseable; otherwise a
 * fully-defaulted object (missing fields become zero scores / empty strings).
 */
export function parseDeprecationAnalysis(output: string): ParsedDeprecationAnalysis | null {
  if (typeof output !== "string") return null;
  const match = output.match(/<deprecation-analysis>([\s\S]*?)<\/deprecation-analysis>/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }
  // Reject non-objects and arrays: a valid analysis body is a JSON object.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const root = parsed as Record<string, unknown>;

  const topics: Partial<Record<ScanTopicKey, ParsedTopic>> = {};
  const rawTopics =
    root.topics && typeof root.topics === "object"
      ? (root.topics as Record<string, unknown>)
      : {};
  for (const key of TOPIC_KEYS) {
    const topic = parseTopic(rawTopics[key]);
    if (topic) topics[key] = topic;
  }

  return {
    key: asString(root.key) || null,
    topics,
    revival: parseRevival(root.revival),
    summary: asString(root.summary),
  };
}
