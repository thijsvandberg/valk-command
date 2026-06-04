// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, jiraComment, appSetting, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: { isLive: false },
  JiraApiError: class extends Error {},
  extractSprint: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { runDeprecationStalenessScan } from "./scheduled-tasks";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function insertTicket(key: string, opts: {
  sprintName: string;
  status: string;
  updated: string;
  removed?: string;
  epicKey?: string;
}) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: key,
    status: opts.status,
    sprintName: opts.sprintName,
    jiraUpdatedAt: opts.updated,
    removedFromJiraAt: opts.removed ?? null,
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

describe("runDeprecationStalenessScan", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
  });

  it("scores backlog tickets and writes scan-state fields without an existing metadata row", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });

    const result = await runDeprecationStalenessScan();

    expect(result.scanned).toBe(1);
    expect(result.candidates).toBe(1);
    expect(result.backlogSize).toBe(1);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.scanOverall).toBe(1);
    expect(meta?.lastScannedAt).toBeTruthy();
    expect(meta?.scanRationale).toContain("never in a sprint");
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.staleness.score).toBe(1);
  });

  it("excludes tickets that are in a sprint or removed from Jira", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });
    insertTicket("BT-2", { sprintName: "42", status: "Backlog", updated: daysAgo(600) }); // in sprint
    insertTicket("BT-3", { sprintName: "", status: "Backlog", updated: daysAgo(600), removed: daysAgo(1) });

    const result = await runDeprecationStalenessScan();

    expect(result.backlogSize).toBe(1);
    expect(result.scanned).toBe(1);
    const scanned2 = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-2")).get();
    expect(scanned2).toBeUndefined();
  });

  it("preserves pre-existing non-staleness scores and PO metadata fields", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });
    testDb.insert(ticketMetadata).values({
      jiraKey: "BT-1",
      poNotes: "keep me",
      scanScores: JSON.stringify({ duplication: { score: 0.9 } }),
    }).run();

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.poNotes).toBe("keep me");
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.duplication.score).toBe(0.9);
    expect(scores.staleness).toBeTruthy();
  });

  it("counts a ticket with populated PO metadata as not a candidate when otherwise fresh", async () => {
    insertTicket("BT-1", { sprintName: "5", status: "In Progress", updated: daysAgo(5) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    const result = await runDeprecationStalenessScan();
    expect(result.candidates).toBe(0);
  });

  it("writes the rolling cursor and logs a run summary", async () => {
    insertTicket("BT-1", { sprintName: "", status: "Backlog", updated: daysAgo(600) });

    await runDeprecationStalenessScan();

    const cursor = testDb.select().from(appSetting)
      .where(eq(appSetting.key, "scheduler:deprecation-staleness-scan:cursor")).get();
    expect(cursor?.value).toBeTruthy();

    const logs = testDb.select().from(activityLog).all();
    const entry = logs.find((l) => l.type === "deprecation-scan");
    expect(entry).toBeTruthy();
    expect(entry?.summary).toContain("Staleness scan");
  });

  it("returns an empty result when the backlog is empty", async () => {
    const result = await runDeprecationStalenessScan();
    expect(result).toEqual({ scanned: 0, candidates: 0, backlogSize: 0 });
  });

  // --- comment activity tests ---

  it("uses the most recent comment to reduce age staleness vs jiraUpdatedAt alone", async () => {
    // Backlog ticket: jiraUpdatedAt is 400 days old (stale age signal).
    // With PO metadata and In Progress status, the only signals are age + never-in-sprint.
    // Run without a comment first (baseline), then with a recent comment (20 days).
    // The comment should zero out the age component (20 days < 90-day floor),
    // reducing the score from the baseline.
    insertTicket("BT-1", { sprintName: "", status: "In Progress", updated: daysAgo(400) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    // Baseline: no comment.
    await runDeprecationStalenessScan();
    const baseline = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    const baselineScore = baseline?.scanOverall ?? 0;

    // Now add a recent comment and re-scan (reset lastScannedAt so it's re-processed).
    testDb.update(ticketMetadata).set({ lastScannedAt: null }).run();
    insertComment("c1", "BT-1", daysAgo(20));

    await runDeprecationStalenessScan();
    const afterComment = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();

    // Score should be lower: age (>0 before) is now 0; only never-in-sprint remains.
    expect(afterComment?.scanOverall).toBeLessThan(baselineScore);
    // The age signal should not appear since effective age < 90-day floor.
    expect(afterComment?.scanRationale).not.toContain("No activity since");
  });

  it("picks the latest of multiple comments on the same ticket", async () => {
    // Same setup: two comments. The scorer should pick the most recent (20 days).
    insertTicket("BT-1", { sprintName: "", status: "In Progress", updated: daysAgo(400) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();
    insertComment("c1", "BT-1", daysAgo(300));
    insertComment("c2", "BT-1", daysAgo(20));

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    // Effective age = 20 days < floor: age staleness is zero; only never-in-sprint fires.
    expect(meta?.scanRationale).not.toContain("No activity since");
    expect(meta?.scanOverall).toBeCloseTo(0.25, 2); // only never-in-sprint
  });

  it("does not raise staleness when comments are older than jiraUpdatedAt", async () => {
    // jiraUpdatedAt = 10 days ago (fresh); comment = 400 days ago (stale).
    // The scorer uses max(10, 400) = 10 days, so the age signal stays silent.
    insertTicket("BT-1", { sprintName: "", status: "In Progress", updated: daysAgo(10) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();
    insertComment("c1", "BT-1", daysAgo(400));

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    // Only never-in-sprint fires; age is silent because jiraUpdatedAt wins (10 days).
    expect(meta?.scanRationale).not.toContain("No activity since");
    expect(meta?.scanOverall).toBeCloseTo(0.25, 2);
  });

  // --- epic dampener tests ---

  it("dampens age staleness when the linked epic has recent activity", async () => {
    // Old backlog ticket (315 days, half-ramp age) with PO metadata and in-sprint
    // so the only active signals are age + never-in-sprint (0.25 + 0.25 = 0.50).
    // The epic was active 30 days ago (within 180-day window): dampener fires.
    insertTicket("EPIC-1", { sprintName: "1", status: "In Progress", updated: daysAgo(30) });
    insertTicket("BT-1", { sprintName: "", status: "In Progress", updated: daysAgo(315), epicKey: "EPIC-1" });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    // Without epic dampener: age = 0.25, never-in-sprint = 0.25 -> 0.50.
    // With dampener on the age component: score must be less than 0.50.
    expect(meta?.scanOverall).toBeLessThan(0.5);
    expect(meta?.scanRationale).toContain("linked epic recently active (dampened)");
  });

  it("also considers epic comment activity for the epic dampener", async () => {
    // Epic jiraUpdatedAt is stale (400 days), but it has a recent comment (20 days).
    // The effective epic activity = max(400, 20) = 20 days, which is within 180 days.
    insertTicket("EPIC-1", { sprintName: "1", status: "In Progress", updated: daysAgo(400) });
    insertComment("ec1", "EPIC-1", daysAgo(20));
    insertTicket("BT-1", { sprintName: "", status: "In Progress", updated: daysAgo(315), epicKey: "EPIC-1" });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    // Epic's effective activity is 20 days (from its comment): dampener fires.
    expect(meta?.scanRationale).toContain("linked epic recently active (dampened)");
  });

  it("does not apply the epic dampener when the epic activity is outside the 180-day window", async () => {
    insertTicket("EPIC-1", { sprintName: "1", status: "In Progress", updated: daysAgo(200) });
    insertTicket("BT-1", { sprintName: "", status: "In Progress", updated: daysAgo(315), epicKey: "EPIC-1" });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    // 200 days > 180-day window: dampener does not fire.
    // Expected: age (315 days = half-ramp = 0.25) + never-in-sprint (0.25) = 0.50.
    expect(meta?.scanOverall).toBeCloseTo(0.5, 2);
    expect(meta?.scanRationale).not.toContain("dampened");
  });

  it("handles a missing epicKey gracefully (no dampener, no error)", async () => {
    insertTicket("BT-1", { sprintName: "", status: "In Progress", updated: daysAgo(315) });
    testDb.insert(ticketMetadata).values({ jiraKey: "BT-1", poNotes: "prepared" }).run();

    await runDeprecationStalenessScan();

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    // Expected: age (0.25) + never-in-sprint (0.25) = 0.50.
    expect(meta?.scanOverall).toBeCloseTo(0.5, 2);
    expect(meta?.scanRationale).not.toContain("dampened");
  });
});
