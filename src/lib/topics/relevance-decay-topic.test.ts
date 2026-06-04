// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  runDeepScan,
  combineTopicScores,
  _clearTopicScorers,
  registerTopicScorer,
  DEEP_SCAN_CANDIDATE_THRESHOLD,
} from "@/lib/deprecation-topics";
import {
  RELEVANCE_DECAY_TOPIC,
  RELEVANCE_DECAY_WEIGHT,
  RELEVANCE_DECAY_MAX_CONTRIBUTION,
  parseRelevanceDecayResult,
  buildRelevanceDecayPrompt,
  _setRunAgentFn,
  _resetRunAgentFn,
} from "./relevance-decay-topic";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-04T10:00:00.000Z").getTime();

function insertTicket(key: string, opts: { description?: string } = {}) {
  testDb
    .insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "Backlog",
      sprintName: "",
      description: opts.description ?? null,
    })
    .run();
}

function readFinalScores(key: string): Record<string, { score: number; evidence?: unknown; rationale?: string }> {
  const meta = testDb
    .select()
    .from(ticketMetadata)
    .where(eq(ticketMetadata.jiraKey, key))
    .get();
  return meta?.scanScores ? JSON.parse(meta.scanScores) : {};
}

// ---------------------------------------------------------------------------
// Agent responses
// ---------------------------------------------------------------------------

const AGENT_HIGH_RELEVANCE_DECAY = [
  "RELEVANCE: HIGH",
  "SCORE: 0.9",
  "RATIONALE: Targets a flow the product no longer offers.",
].join("\n");

const AGENT_LOW_RELEVANCE_DECAY = [
  "RELEVANCE: LOW",
  "SCORE: 0.1",
  "RATIONALE: Ticket is consistent with current product direction.",
].join("\n");

const AGENT_UNCLEAR = [
  "RELEVANCE: UNCLEAR",
  "SCORE: 0.5",
  "RATIONALE: Hard to assess without more context.",
].join("\n");

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  testDb = createTestDb();
  _clearTopicScorers();
  registerTopicScorer(RELEVANCE_DECAY_TOPIC);
});

afterEach(() => {
  _resetRunAgentFn();
});

// ---------------------------------------------------------------------------
// parseRelevanceDecayResult unit tests
// ---------------------------------------------------------------------------

describe("parseRelevanceDecayResult", () => {
  it("parses a HIGH decay response correctly", () => {
    const result = parseRelevanceDecayResult(AGENT_HIGH_RELEVANCE_DECAY);
    expect(result.relevance).toBe("HIGH");
    expect(result.score).toBeCloseTo(0.9);
    expect(result.rationale).toBe("Targets a flow the product no longer offers.");
  });

  it("parses a LOW decay response correctly", () => {
    const result = parseRelevanceDecayResult(AGENT_LOW_RELEVANCE_DECAY);
    expect(result.relevance).toBe("LOW");
    expect(result.score).toBeCloseTo(0.1);
    expect(result.rationale).toContain("consistent with current product direction");
  });

  it("parses an UNCLEAR response correctly", () => {
    const result = parseRelevanceDecayResult(AGENT_UNCLEAR);
    expect(result.relevance).toBe("UNCLEAR");
    expect(result.score).toBeCloseTo(0.5);
  });

  it("returns UNPARSEABLE + score=0 for malformed output (safe default)", () => {
    const result = parseRelevanceDecayResult("Some random unstructured text");
    expect(result.relevance).toBe("UNPARSEABLE");
    expect(result.score).toBe(0);
  });

  it("clamps score above 1 to 1", () => {
    const output = ["RELEVANCE: HIGH", "SCORE: 1.5", "RATIONALE: Way off."].join("\n");
    const result = parseRelevanceDecayResult(output);
    expect(result.score).toBe(1);
  });

  it("clamps score below 0 to 0", () => {
    const output = ["RELEVANCE: LOW", "SCORE: -0.3", "RATIONALE: Fine."].join("\n");
    const result = parseRelevanceDecayResult(output);
    expect(result.score).toBe(0);
  });

  it("strips markdown fences from rationale", () => {
    const output = [
      "RELEVANCE: HIGH",
      "SCORE: 0.8",
      "RATIONALE: `Old flow is gone.`",
    ].join("\n");
    const result = parseRelevanceDecayResult(output);
    expect(result.rationale).not.toMatch(/^`/);
    expect(result.rationale).not.toMatch(/`$/);
  });

  it("clamps rationale to 140 chars", () => {
    const longRationale = "x".repeat(200);
    const output = [
      "RELEVANCE: HIGH",
      "SCORE: 0.8",
      `RATIONALE: ${longRationale}`,
    ].join("\n");
    const result = parseRelevanceDecayResult(output);
    expect(result.rationale.length).toBeLessThanOrEqual(140);
  });

  it("provides a fallback rationale when none is present", () => {
    const output = ["RELEVANCE: HIGH", "SCORE: 0.8"].join("\n");
    const result = parseRelevanceDecayResult(output);
    expect(result.rationale.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildRelevanceDecayPrompt
// ---------------------------------------------------------------------------

describe("buildRelevanceDecayPrompt", () => {
  it("includes the ticket key and title", () => {
    const prompt = buildRelevanceDecayPrompt({
      jiraKey: "BT-999",
      title: "Test prompt ticket",
      status: "Backlog",
      description: "Some description",
      jiraUpdatedAt: null,
      sprintName: null,
      labels: null,
      components: null,
    });
    expect(prompt).toContain("BT-999");
    expect(prompt).toContain("Test prompt ticket");
  });

  it("references the PRD doc path", () => {
    const prompt = buildRelevanceDecayPrompt({
      jiraKey: "BT-1",
      title: "X",
      status: "Backlog",
      description: null,
      jiraUpdatedAt: null,
      sprintName: null,
      labels: null,
      components: null,
    });
    expect(prompt).toContain("docs/plans/2026-03-27-valk-command-prd.md");
  });

  it("references the investigate skill in the skill field (scorer), not the prompt itself", () => {
    // The prompt does not need to name the skill; the scorer passes skill="investigate".
    // This test ensures the prompt is structured for the RELEVANCE three-line format.
    const prompt = buildRelevanceDecayPrompt({
      jiraKey: "BT-1",
      title: "X",
      status: "Backlog",
      description: null,
      jiraUpdatedAt: null,
      sprintName: null,
      labels: null,
      components: null,
    });
    expect(prompt).toContain("RELEVANCE:");
    expect(prompt).toContain("SCORE:");
    expect(prompt).toContain("RATIONALE:");
  });

  it("truncates long descriptions to prevent oversized prompts", () => {
    const longDesc = "A".repeat(5000);
    const prompt = buildRelevanceDecayPrompt({
      jiraKey: "BT-1",
      title: "X",
      status: "Backlog",
      description: longDesc,
      jiraUpdatedAt: null,
      sprintName: null,
      labels: null,
      components: null,
    });
    // Description is sliced to 1200 chars, so prompt should be well under 3000.
    expect(prompt.length).toBeLessThan(3000);
  });
});

// ---------------------------------------------------------------------------
// Cap math — the core guarantee
// ---------------------------------------------------------------------------

describe("RELEVANCE_DECAY — cap math: cannot flag alone", () => {
  it("RELEVANCE_DECAY_MAX_CONTRIBUTION is below the candidate threshold", () => {
    // Fundamental invariant: the cap must be below the threshold.
    expect(RELEVANCE_DECAY_MAX_CONTRIBUTION).toBeLessThan(DEEP_SCAN_CANDIDATE_THRESHOLD);
  });

  it("overall stays below threshold when only relevance-decay scores (worst case: score=1.0)", () => {
    // Worst-case solo contribution: full score, no other topics.
    const overall = combineTopicScores([
      {
        key: "relevance",
        score: 1.0,
        weight: RELEVANCE_DECAY_WEIGHT,
        cap: RELEVANCE_DECAY_MAX_CONTRIBUTION,
      },
    ]);
    expect(overall).toBeLessThan(DEEP_SCAN_CANDIDATE_THRESHOLD);
  });

  it("overall stays below threshold even with a medium score solo", () => {
    const overall = combineTopicScores([
      {
        key: "relevance",
        score: 0.7,
        weight: RELEVANCE_DECAY_WEIGHT,
        cap: RELEVANCE_DECAY_MAX_CONTRIBUTION,
      },
    ]);
    expect(overall).toBeLessThan(DEEP_SCAN_CANDIDATE_THRESHOLD);
  });

  it("overall crosses threshold when relevance-decay corroborates a strong staleness signal", () => {
    // Staleness alone at 1.0 would also cross the threshold, but here we confirm
    // the combined signal works as intended — each adds its share.
    const overall = combineTopicScores([
      {
        key: "relevance",
        score: 1.0,
        weight: RELEVANCE_DECAY_WEIGHT,
        cap: RELEVANCE_DECAY_MAX_CONTRIBUTION,
      },
      {
        // Staleness: weight=1, no special cap (cap=weight=1).
        key: "staleness",
        score: 1.0,
        weight: 1,
        cap: 1,
      },
    ]);
    expect(overall).toBeGreaterThanOrEqual(DEEP_SCAN_CANDIDATE_THRESHOLD);
  });

  it("overall crosses threshold when relevance-decay corroborates a strong replaced signal", () => {
    // Replaced at full strength (score=1.0) plus relevance cap (0.3) pushes over:
    // numerator = min(1.0, 1) + min(0.9, 0.3) = 1.0 + 0.3 = 1.3
    // denominator = 2
    // overall = 1.3 / 2 = 0.65 >= 0.6
    const overall = combineTopicScores([
      {
        key: "relevance",
        score: 0.9,
        weight: RELEVANCE_DECAY_WEIGHT,
        cap: RELEVANCE_DECAY_MAX_CONTRIBUTION,
      },
      {
        key: "replaced",
        score: 1.0,
        weight: 1,
        cap: 1,
      },
    ]);
    expect(overall).toBeGreaterThanOrEqual(DEEP_SCAN_CANDIDATE_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// Full scorer via runDeepScan
// ---------------------------------------------------------------------------

describe("RELEVANCE_DECAY_TOPIC — run via runDeepScan", () => {
  it("writes relevance score + evidence + rationale when agent scores high decay", async () => {
    insertTicket("BT-50", { description: "Add support for the retired CWI integration." });

    _setRunAgentFn(async () => ({ ok: true, output: AGENT_HIGH_RELEVANCE_DECAY }));

    const result = await runDeepScan("BT-50", { now: NOW });

    expect(result.topicsRun).toContain("relevance");

    const meta = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "BT-50"))
      .get();
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.relevance.score).toBeCloseTo(0.9);
    expect(scores.relevance.evidence.relevance).toBe("HIGH");
    expect(scores.relevance.rationale).toBe("Targets a flow the product no longer offers.");
    expect(meta!.scanRationale).toContain("Targets a flow the product no longer offers.");
  });

  it("abstains (no relevance written) when agent scores near-zero decay", async () => {
    insertTicket("BT-51");
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_LOW_RELEVANCE_DECAY }));

    const result = await runDeepScan("BT-51", { now: NOW });

    // Score 0.1 < 0.15 abstain threshold; topic should not appear.
    expect(result.topicsRun).not.toContain("relevance");
    const scores = readFinalScores("BT-51");
    expect(scores.relevance).toBeUndefined();
  });

  it("writes relevance score when agent returns UNCLEAR with a mid score", async () => {
    insertTicket("BT-52");
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_UNCLEAR }));

    const result = await runDeepScan("BT-52", { now: NOW });

    expect(result.topicsRun).toContain("relevance");
    const scores = readFinalScores("BT-52");
    expect(scores.relevance.score).toBeCloseTo(0.5);
  });

  it("degrades gracefully (abstains, never throws) when the agent fails", async () => {
    insertTicket("BT-53");
    _setRunAgentFn(async () => ({
      ok: false,
      reason: "timeout" as const,
      error: "Timed out waiting for the workspace task",
    }));

    const result = await runDeepScan("BT-53", { now: NOW });

    expect(result.scanned).toBe(true);
    expect(result.topicsRun).not.toContain("relevance");
    const scores = readFinalScores("BT-53");
    expect(scores.relevance).toBeUndefined();
  });

  it("degrades gracefully when the agent returns an unparseable response", async () => {
    insertTicket("BT-54");
    _setRunAgentFn(async () => ({ ok: true, output: "This is not a valid response at all." }));

    const result = await runDeepScan("BT-54", { now: NOW });

    expect(result.scanned).toBe(true);
    expect(result.topicsRun).not.toContain("relevance");
  });

  it("does not alter scanScores from other topics when it abstains", async () => {
    insertTicket("BT-55");
    // Pre-seed a staleness score.
    testDb
      .insert(ticketMetadata)
      .values({
        jiraKey: "BT-55",
        scanScores: JSON.stringify({ staleness: { score: 0.7, rationale: "Very old." } }),
      })
      .run();

    // Agent returns low decay => abstain.
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_LOW_RELEVANCE_DECAY }));

    await runDeepScan("BT-55", { now: NOW });

    const scores = readFinalScores("BT-55");
    expect(scores.staleness).toBeDefined();
    expect(scores.staleness.score).toBeCloseTo(0.7);
    expect(scores.relevance).toBeUndefined();
  });

  it("overall score stays below candidate threshold when only relevance fires (full score)", async () => {
    insertTicket("BT-56");
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_HIGH_RELEVANCE_DECAY }));

    const result = await runDeepScan("BT-56", { now: NOW });

    // Despite high relevance-decay score, overall must stay below 0.6 alone.
    expect(result.scanOverall).toBeLessThan(DEEP_SCAN_CANDIDATE_THRESHOLD);
  });

  it("does not flag as candidate when only relevance fires", async () => {
    insertTicket("BT-57");
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_HIGH_RELEVANCE_DECAY }));

    const result = await runDeepScan("BT-57", { now: NOW });

    expect(result.becameCandidate).toBe(false);

    const meta = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "BT-57"))
      .get();
    expect(meta?.disposition).not.toBe("candidate");
  });

  it("becomes a candidate when relevance-decay corroborates a high staleness score", async () => {
    insertTicket("BT-58");
    // Pre-seed a high staleness score (like Tier-1 would write).
    testDb
      .insert(ticketMetadata)
      .values({
        jiraKey: "BT-58",
        scanScores: JSON.stringify({ staleness: { score: 1.0 } }),
      })
      .run();

    _setRunAgentFn(async () => ({ ok: true, output: AGENT_HIGH_RELEVANCE_DECAY }));

    const result = await runDeepScan("BT-58", { now: NOW });

    expect(result.scanOverall).toBeGreaterThanOrEqual(DEEP_SCAN_CANDIDATE_THRESHOLD);
    expect(result.becameCandidate).toBe(true);
  });
});
