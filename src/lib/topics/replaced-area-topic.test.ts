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
  _clearTopicScorers,
  registerTopicScorer,
  DEEP_SCAN_CANDIDATE_THRESHOLD,
} from "@/lib/deprecation-topics";
import {
  REPLACED_AREA_TOPIC,
  _setConfirmFn,
  _resetConfirmFn,
  _setLoadAreasFn,
  _resetLoadAreasFn,
} from "./replaced-area-topic";

function insertTicket(key: string, opts: { title?: string; description?: string } = {}) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: opts.title ?? key,
    status: "Backlog",
    sprintName: "",
    description: opts.description ?? null,
  }).run();
}

function readScores(key: string) {
  const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get();
  return JSON.parse(meta!.scanScores!);
}

beforeEach(() => {
  testDb = createTestDb();
  _clearTopicScorers();
  registerTopicScorer(REPLACED_AREA_TOPIC);
  _setLoadAreasFn(async () => [
    { term: "CWI" },
    { term: "RezExchange", aliases: "Rez Exchange" },
  ]);
});

afterEach(() => {
  _resetConfirmFn();
  _resetLoadAreasFn();
});

describe("REPLACED_AREA_TOPIC via runDeepScan", () => {
  it("abstains (no replaced score) when no keyword matches", async () => {
    insertTicket("BT-1", { title: "Refine the sprint board" });
    _setConfirmFn(async () => {
      throw new Error("confirm should not be called when there is no match");
    });

    const result = await runDeepScan("BT-1");
    expect(result.topicsRun).not.toContain("replaced");
    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    const scores = meta?.scanScores ? JSON.parse(meta.scanScores) : {};
    expect(scores.replaced).toBeUndefined();
  });

  it("scores high and promotes to candidate when the AI confirms", async () => {
    insertTicket("BT-2", { title: "Retire CWI dashboards" });
    _setConfirmFn(async () => ({
      confirmed: true,
      rationale: "About CWI, which has been replaced.",
    }));

    const result = await runDeepScan("BT-2");
    expect(result.topicsRun).toContain("replaced");
    expect(result.scanOverall).toBeGreaterThanOrEqual(DEEP_SCAN_CANDIDATE_THRESHOLD);
    expect(result.becameCandidate).toBe(true);

    const scores = readScores("BT-2");
    expect(scores.replaced.score).toBeGreaterThanOrEqual(0.8);
    expect(scores.replaced.evidence.matchedAreas).toContain("CWI");
    expect(scores.replaced.evidence.aiConfirmed).toBe(true);
    expect(scores.replaced.rationale).toMatch(/replaced/i);
  });

  it("collapses the score when the AI judges the mention incidental", async () => {
    insertTicket("BT-3", { title: "Generic title", description: "Mentions CWI once in passing." });
    _setConfirmFn(async () => ({
      confirmed: false,
      rationale: "CWI mentioned incidentally.",
    }));

    const result = await runDeepScan("BT-3");
    const scores = readScores("BT-3");
    expect(scores.replaced.score).toBeLessThan(0.3);
    expect(scores.replaced.evidence.aiConfirmed).toBe(false);
    expect(result.becameCandidate).toBe(false);
  });

  it("degrades gracefully (lower confidence, never throws) when the agent is unavailable", async () => {
    insertTicket("BT-4", { title: "Retire CWI dashboards" });
    _setConfirmFn(async () => null); // simulates agent unavailable/error

    const result = await runDeepScan("BT-4");
    expect(result.scanned).toBe(true);
    const scores = readScores("BT-4");
    expect(scores.replaced.evidence.degraded).toBe(true);
    expect(scores.replaced.evidence.aiConfirmed).toBeNull();
    // Degraded score is pulled down so it cannot alone cross the threshold.
    expect(scores.replaced.score).toBeLessThan(DEEP_SCAN_CANDIDATE_THRESHOLD);
    expect(scores.replaced.rationale).toMatch(/unavailable/i);
  });
});
