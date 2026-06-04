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

const agentFetch = vi.fn();
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: (...args: unknown[]) => agentFetch(...args),
}));

import {
  runDeepScan,
  _clearTopicScorers,
  registerTopicScorer,
} from "@/lib/deprecation-topics";
import {
  SUPERSEDED_TOPIC,
  _resetFetchMatchesFn,
  _setAgentPollOptions,
  _resetAgentPollOptions,
} from "./superseded-topic";

const OLDER = "2026-01-01T00:00:00.000Z";
const NEWER = "2026-06-01T00:00:00.000Z";

function ok<T>(data: T) {
  return { ok: true as const, data, status: 200, retryCount: 0 };
}

function insertTicket(key: string, status: string, updated: string) {
  testDb
    .insert(ticket)
    .values({ jiraKey: key, title: key, status, sprintName: "", jiraUpdatedAt: updated })
    .run();
}

beforeEach(() => {
  testDb = createTestDb();
  agentFetch.mockReset();
  _clearTopicScorers();
  registerTopicScorer(SUPERSEDED_TOPIC);
  // No real timers: poll resolves on the first attempt.
  _setAgentPollOptions({ sleep: () => Promise.resolve(), maxAttempts: 1 });
});

afterEach(() => {
  _resetFetchMatchesFn();
  _resetAgentPollOptions();
});

describe("default match source (cache + find-related)", () => {
  it("uses a fresh shared-cache entry without calling the agent", async () => {
    insertTicket("BT-1", "Backlog", OLDER);
    insertTicket("BT-200", "In Progress", NEWER);
    testDb
      .insert(relatedSuggestionCache)
      .values({
        id: "c1",
        ticketKey: "BT-1",
        suggestedKey: "BT-200",
        score: 91,
        title: "Login refactor",
        status: "In Progress",
        reason: "Same work",
        suggestedRelation: "relates to",
        createdAt: new Date().toISOString(),
      })
      .run();

    const result = await runDeepScan("BT-1");
    expect(agentFetch).not.toHaveBeenCalled();
    expect(result.topicsRun).toContain("duplicate");
    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.duplicate.evidence.supersededBy).toBe("BT-200");
  });

  it("runs find-related on a cold cache, parses the XML, caches it, and scores", async () => {
    insertTicket("BT-2", "Backlog", OLDER);
    insertTicket("BT-300", "In Review", NEWER);

    const xml = `<related-stories>${JSON.stringify([
      {
        key: "BT-300",
        score: 93,
        title: "Auth rework",
        type: "Story",
        status: "In Review",
        reason: "Overlapping auth scope",
      },
    ])}</related-stories>`;

    agentFetch
      .mockResolvedValueOnce(ok({ id: "task-9" })) // POST submit
      .mockResolvedValueOnce(ok({ status: "completed", output: xml })); // poll

    const result = await runDeepScan("BT-2");
    expect(result.topicsRun).toContain("duplicate");

    // Persisted into the shared cache for reuse.
    const cached = testDb
      .select()
      .from(relatedSuggestionCache)
      .where(eq(relatedSuggestionCache.ticketKey, "BT-2"))
      .all();
    expect(cached).toHaveLength(1);
    expect(cached[0].suggestedKey).toBe("BT-300");

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-2")).get();
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.duplicate.evidence.supersededBy).toBe("BT-300");
    expect(scores.duplicate.evidence.overlapScore).toBe(93);
  });
});
