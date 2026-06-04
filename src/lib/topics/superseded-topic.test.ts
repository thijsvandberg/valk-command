// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, relatedSuggestionCache } from "@/db/schema";
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
  SUPERSEDED_TOPIC,
  _setFetchMatchesFn,
  _resetFetchMatchesFn,
} from "./superseded-topic";

const OLDER = "2026-01-01T00:00:00.000Z";
const NEWER = "2026-06-01T00:00:00.000Z";

function insertTicket(
  key: string,
  opts: { status?: string; updated?: string | null } = {},
) {
  testDb
    .insert(ticket)
    .values({
      jiraKey: key,
      title: key,
      status: opts.status ?? "Backlog",
      sprintName: "",
      jiraUpdatedAt: opts.updated ?? null,
    })
    .run();
}

function readScores(key: string) {
  const meta = testDb
    .select()
    .from(ticketMetadata)
    .where(eq(ticketMetadata.jiraKey, key))
    .get();
  return JSON.parse(meta!.scanScores!);
}

beforeEach(() => {
  testDb = createTestDb();
  _clearTopicScorers();
  registerTopicScorer(SUPERSEDED_TOPIC);
});

afterEach(() => {
  _resetFetchMatchesFn();
});

describe("SUPERSEDED_TOPIC via runDeepScan", () => {
  it("abstains when find-related returns no matches", async () => {
    insertTicket("BT-1", { updated: OLDER });
    _setFetchMatchesFn(async () => []);

    const result = await runDeepScan("BT-1");
    expect(result.topicsRun).not.toContain("duplicate");
    const meta = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "BT-1"))
      .get();
    const scores = meta?.scanScores ? JSON.parse(meta.scanScores) : {};
    expect(scores.duplicate).toBeUndefined();
  });

  it("flags + promotes to candidate when a newer active match strongly overlaps", async () => {
    insertTicket("BT-2", { status: "Backlog", updated: OLDER });
    // Survivor present locally and newer/active.
    insertTicket("BT-200", { status: "In Progress", updated: NEWER });
    _setFetchMatchesFn(async () => [
      {
        key: "BT-200",
        score: 92,
        title: "Login refactor",
        status: "In Progress",
        reason: "Same login refactor work",
      },
    ]);

    const result = await runDeepScan("BT-2");
    expect(result.topicsRun).toContain("duplicate");
    expect(result.scanOverall).toBeGreaterThanOrEqual(DEEP_SCAN_CANDIDATE_THRESHOLD);
    expect(result.becameCandidate).toBe(true);

    const scores = readScores("BT-2");
    expect(scores.duplicate.score).toBeGreaterThan(0.9);
    expect(scores.duplicate.evidence.supersededBy).toBe("BT-200");
    expect(scores.duplicate.evidence.overlapScore).toBe(92);
    expect(scores.duplicate.evidence.matchReason).toBe("Same login refactor work");
    expect(scores.duplicate.rationale).toBe("Likely superseded by BT-200");

    const meta = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "BT-2"))
      .get();
    expect(meta!.scanRationale).toContain("Likely superseded by BT-200");
  });

  it("does NOT flag this ticket when it is the survivor (match is older, not active)", async () => {
    insertTicket("BT-3", { status: "In Progress", updated: NEWER });
    insertTicket("BT-OLD", { status: "Backlog", updated: OLDER });
    _setFetchMatchesFn(async () => [
      {
        key: "BT-OLD",
        score: 95,
        title: "Old duplicate",
        status: "Backlog",
        reason: "Same work, older",
      },
    ]);

    const result = await runDeepScan("BT-3");
    expect(result.topicsRun).not.toContain("duplicate");
    expect(result.becameCandidate).toBe(false);
    const scores = readScores("BT-3");
    expect(scores.duplicate).toBeUndefined();
  });

  it("uses the match recency from the local ticket table for the newer check", async () => {
    insertTicket("BT-4", { status: "Backlog", updated: OLDER });
    // Match is backlog (not active) but newer per local DB -> still a survivor.
    insertTicket("BT-NEWER", { status: "Backlog", updated: NEWER });
    _setFetchMatchesFn(async () => [
      {
        key: "BT-NEWER",
        score: 88,
        title: "Newer backlog duplicate",
        status: "Backlog",
        reason: "Same scope, raised later",
      },
    ]);

    const result = await runDeepScan("BT-4");
    expect(result.topicsRun).toContain("duplicate");
    const scores = readScores("BT-4");
    expect(scores.duplicate.evidence.supersededBy).toBe("BT-NEWER");
    expect(scores.duplicate.evidence.survivorBasis).toEqual(["newer"]);
  });
});
