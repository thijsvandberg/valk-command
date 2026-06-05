// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, jiraComment } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { scoreStalenessForKeys } from "./deprecation-staleness-runner";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function insertTicket(key: string, opts: {
  sprintName?: string;
  status?: string;
  updated?: string;
  removed?: string;
  type?: string | null;
  epicKey?: string;
}) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: key,
    status: opts.status ?? "Backlog",
    sprintName: opts.sprintName ?? "",
    jiraUpdatedAt: opts.updated ?? daysAgo(600),
    removedFromJiraAt: opts.removed ?? null,
    type: opts.type === undefined ? null : opts.type,
    epicKey: opts.epicKey ?? null,
  }).run();
}

function insertComment(id: string, ticketKey: string, createdAt: string) {
  testDb.insert(jiraComment).values({
    id,
    ticketKey,
    authorName: "tester",
    content: "comment",
    createdAt,
  }).run();
}

describe("scoreStalenessForKeys", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("scores an eligible backlog ticket and writes the scan-state fields", async () => {
    insertTicket("BT-1", { updated: daysAgo(600) });

    const result = await scoreStalenessForKeys(["BT-1"]);

    expect(result).toEqual({ scored: 1, skipped: 0 });
    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.scanOverall).toBe(1);
    expect(meta?.lastScannedAt).toBeTruthy();
    expect(meta?.scanRationale).toContain("never in a sprint");
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.staleness.score).toBe(1);
  });

  it("skips ineligible keys: subtasks, finished, in-sprint, removed, and unknown", async () => {
    insertTicket("BT-OK", { updated: daysAgo(600) });
    insertTicket("BT-SUB", { type: "subtask" });
    insertTicket("BT-DONE", { status: "DONE" });
    insertTicket("BT-SPRINT", { sprintName: "5" });
    insertTicket("BT-REMOVED", { removed: daysAgo(1) });

    const result = await scoreStalenessForKeys([
      "BT-OK", "BT-SUB", "BT-DONE", "BT-SPRINT", "BT-REMOVED", "GHOST-9",
    ]);

    expect(result.scored).toBe(1);
    expect(result.skipped).toBe(5);
    // Only the eligible ticket gets a metadata row.
    const rows = testDb.select().from(ticketMetadata).all();
    expect(rows.map((r) => r.jiraKey)).toEqual(["BT-OK"]);
  });

  it("merges into existing scanScores instead of clobbering deep-scan topic scores", async () => {
    insertTicket("BT-1", { updated: daysAgo(600) });
    testDb.insert(ticketMetadata).values({
      jiraKey: "BT-1",
      poNotes: "keep me",
      scanScores: JSON.stringify({ duplication: { score: 0.9 } }),
    }).run();

    await scoreStalenessForKeys(["BT-1"]);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.poNotes).toBe("keep me");
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.duplication.score).toBe(0.9);
    expect(scores.staleness).toBeTruthy();
  });

  it("bulk-gathers comment activity and reduces age staleness from a recent comment", async () => {
    // jiraUpdatedAt is old (400d) but a recent comment (20d) should win, zeroing age.
    insertTicket("BT-1", { status: "In Progress", updated: daysAgo(400) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();
    insertComment("c1", "BT-1", daysAgo(20));

    await scoreStalenessForKeys(["BT-1"]);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.scanRationale).not.toContain("No activity since");
    // Only never-in-sprint fires.
    expect(meta?.scanOverall).toBeCloseTo(0.25, 2);
  });

  it("applies the linked-epic dampener using bulk-gathered epic activity", async () => {
    insertTicket("EPIC-1", { sprintName: "1", status: "In Progress", updated: daysAgo(30) });
    insertTicket("BT-1", { status: "In Progress", updated: daysAgo(315), epicKey: "EPIC-1" });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    await scoreStalenessForKeys(["BT-1"]);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.scanOverall).toBeLessThan(0.5);
    expect(meta?.scanRationale).toContain("linked epic recently active (dampened)");
  });

  it("counts candidates that cross the threshold", async () => {
    insertTicket("BT-STALE", { updated: daysAgo(600) }); // candidate
    insertTicket("BT-FRESH", { sprintName: "", status: "In Progress", updated: daysAgo(5) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-FRESH", poNotes: "prepared" }).run();

    const result = await scoreStalenessForKeys(["BT-STALE", "BT-FRESH"]);
    expect(result.scored).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("de-dupes requested keys so a repeated key counts once", async () => {
    insertTicket("BT-1", { updated: daysAgo(600) });
    const result = await scoreStalenessForKeys(["BT-1", "BT-1", "BT-1"]);
    expect(result).toEqual({ scored: 1, skipped: 0 });
  });

  it("returns zero counts for an empty key list (no-op)", async () => {
    const result = await scoreStalenessForKeys([]);
    expect(result).toEqual({ scored: 0, skipped: 0 });
    expect(testDb.select().from(ticketMetadata).all()).toHaveLength(0);
  });
});
