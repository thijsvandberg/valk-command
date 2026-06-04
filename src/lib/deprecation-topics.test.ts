// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  combineTopicScores,
  registerTopicScorer,
  getTopicScorers,
  _clearTopicScorers,
  runDeepScan,
  EXAMPLE_RETIRED_AREA_SCORER,
  DEEP_SCAN_CANDIDATE_THRESHOLD,
  type DeprecationTopicScorer,
} from "./deprecation-topics";

function insertTicket(key: string, opts: { title?: string; removed?: string } = {}) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: opts.title ?? key,
    status: "Backlog",
    sprintName: "",
    removedFromJiraAt: opts.removed ?? null,
  }).run();
}

const stubScorer = (key: string, score: number, extra: Partial<DeprecationTopicScorer> = {}): DeprecationTopicScorer => ({
  key: key as DeprecationTopicScorer["key"],
  label: key,
  async run() {
    return { score, rationale: `${key} fired` };
  },
  ...extra,
});

describe("combineTopicScores", () => {
  it("returns 0 for no contributions", () => {
    expect(combineTopicScores([])).toBe(0);
  });

  it("is a weighted average over scored topics", () => {
    // (1*1 + 0*1) / (1+1) = 0.5
    const r = combineTopicScores([
      { key: "a", score: 1, weight: 1, cap: 1 },
      { key: "b", score: 0, weight: 1, cap: 1 },
    ]);
    expect(r).toBeCloseTo(0.5);
  });

  it("caps a topic's contribution below its weight (the subjective-topic hook)", () => {
    // Topic b scores 1.0 with weight 1 but a cap of 0.2: its numerator share is
    // capped at 0.2, so it cannot alone push the average high.
    const r = combineTopicScores([
      { key: "a", score: 0, weight: 1, cap: 1 },
      { key: "b", score: 1, weight: 1, cap: 0.2 },
    ]);
    // (0 + 0.2) / 2 = 0.1
    expect(r).toBeCloseTo(0.1);
  });

  it("clamps the result to 0..1", () => {
    const r = combineTopicScores([{ key: "a", score: 5, weight: 1, cap: 5 }]);
    expect(r).toBe(1);
  });
});

describe("topic scorer registry", () => {
  beforeEach(() => {
    _clearTopicScorers();
  });

  it("registers and lists scorers, idempotent per key", () => {
    registerTopicScorer(stubScorer("replaced", 0.5));
    registerTopicScorer(stubScorer("replaced", 0.9)); // replaces same key
    expect(getTopicScorers()).toHaveLength(1);
    expect(getTopicScorers()[0].key).toBe("replaced");
  });
});

describe("runDeepScan", () => {
  beforeEach(() => {
    testDb = createTestDb();
    _clearTopicScorers();
  });

  it("returns scanned:false for a missing or removed ticket", async () => {
    const missing = await runDeepScan("NOPE-1");
    expect(missing.scanned).toBe(false);

    insertTicket("BT-R", { removed: "2026-01-01T00:00:00Z" });
    const removed = await runDeepScan("BT-R");
    expect(removed.scanned).toBe(false);
  });

  it("merges topic results into scanScores and preserves Tier-1 staleness", async () => {
    insertTicket("BT-1");
    testDb.insert(ticketMetadata).values({
      jiraKey: "BT-1",
      scanScores: JSON.stringify({ staleness: { score: 0.4, rationale: "old" } }),
    }).run();

    registerTopicScorer(stubScorer("replaced", 0.8));

    const result = await runDeepScan("BT-1");
    expect(result.scanned).toBe(true);
    expect(result.topicsRun).toContain("replaced");

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.staleness.score).toBe(0.4); // preserved
    expect(scores.replaced.score).toBe(0.8); // merged
    expect(meta?.lastDeepScannedAt).toBeTruthy();
  });

  it("sets disposition=candidate when scanOverall crosses the threshold", async () => {
    insertTicket("BT-2");
    registerTopicScorer(stubScorer("replaced", 1));

    const result = await runDeepScan("BT-2");
    expect(result.scanOverall).toBeGreaterThanOrEqual(DEEP_SCAN_CANDIDATE_THRESHOLD);
    expect(result.becameCandidate).toBe(true);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-2")).get();
    expect(meta?.disposition).toBe("candidate");
  });

  it("does not promote below threshold and reports becameCandidate=false", async () => {
    insertTicket("BT-3");
    registerTopicScorer(stubScorer("replaced", 0.2));

    const result = await runDeepScan("BT-3");
    expect(result.scanOverall).toBeLessThan(DEEP_SCAN_CANDIDATE_THRESHOLD);
    expect(result.becameCandidate).toBe(false);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-3")).get();
    expect(meta?.disposition ?? null).toBeNull();
  });

  it("never downgrades a human dismissed/confirmed disposition", async () => {
    insertTicket("BT-4");
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-4", disposition: "dismissed" }).run();
    registerTopicScorer(stubScorer("replaced", 1));

    await runDeepScan("BT-4");
    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-4")).get();
    expect(meta?.disposition).toBe("dismissed");
  });

  it("an abstaining (null) topic does not contribute", async () => {
    insertTicket("BT-5");
    registerTopicScorer({
      key: "replaced",
      label: "abstain",
      async run() { return null; },
    });

    const result = await runDeepScan("BT-5");
    expect(result.topicsRun).toEqual([]);
    expect(result.scanOverall).toBe(0);
  });

  it("a throwing topic is treated as abstaining and does not sink the scan", async () => {
    insertTicket("BT-6");
    registerTopicScorer({
      key: "replaced",
      label: "boom",
      async run() { throw new Error("boom"); },
    });
    registerTopicScorer(stubScorer("duplicate", 0.9));

    const result = await runDeepScan("BT-6");
    expect(result.scanned).toBe(true);
    expect(result.topicsRun).toEqual(["duplicate"]);
  });

  it("example stub scorer flags a retired-area ticket end-to-end", async () => {
    insertTicket("BT-7", { title: "Migrate CWI dashboard" });
    registerTopicScorer(EXAMPLE_RETIRED_AREA_SCORER);

    const result = await runDeepScan("BT-7");
    expect(result.becameCandidate).toBe(true);
    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-7")).get();
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.replaced.evidence.matchedKeywords).toContain("cwi");
  });
});
