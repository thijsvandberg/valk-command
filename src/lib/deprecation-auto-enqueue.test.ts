// @vitest-environment node
/**
 * Tests for the auto-enqueue scheduled task (BRDG-290).
 *
 * Covers:
 *  - Toggle off = no enqueue
 *  - Toggle on = enqueues up to dailyCount using worst-staleness ordering
 *  - Daily budget enforced across multiple ticks in the same day
 *  - Dismiss cooldown respected
 *  - Budget counter increments and caps correctly
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import {
  ticket, ticketMetadata, appSetting, deprecationScanQueue,
} from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// logActivity writes to the DB; suppress it so tests don't need the full
// activityLog schema to be seeded with any foreign-key dependencies.
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

import {
  AUTO_SCAN_ENABLED_KEY,
  AUTO_SCAN_DAILY_COUNT_KEY,
  AUTO_SCAN_BUDGET_KEY_PREFIX,
} from "@/app/api/cleanup/auto-scan-settings/route";
import { runAutoEnqueue, utcDateKey } from "./scheduled-tasks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedTicket(
  key: string,
  opts: {
    sprintName?: string;
    removedFromJiraAt?: string | null;
    scanOverall?: number | null;
    lastScannedAt?: string | null;
    disposition?: string | null;
    dispositionUntil?: string | null;
  } = {},
) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Ticket ${key}`,
    status: "Backlog",
    sprintName: opts.sprintName ?? "",
    removedFromJiraAt: opts.removedFromJiraAt ?? null,
  }).run();
  if (
    opts.scanOverall !== undefined ||
    opts.lastScannedAt !== undefined ||
    opts.disposition !== undefined ||
    opts.dispositionUntil !== undefined
  ) {
    testDb.insert(ticketMetadata).values({
      jiraKey: key,
      scanOverall: opts.scanOverall ?? null,
      lastScannedAt: opts.lastScannedAt ?? null,
      disposition: opts.disposition ?? null,
      dispositionUntil: opts.dispositionUntil ?? null,
    }).run();
  }
}

function enableAutoScan(enabled: boolean, dailyCount = 10) {
  testDb.insert(appSetting).values({ key: AUTO_SCAN_ENABLED_KEY, value: String(enabled) })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: String(enabled) } }).run();
  testDb.insert(appSetting).values({ key: AUTO_SCAN_DAILY_COUNT_KEY, value: String(dailyCount) })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: String(dailyCount) } }).run();
}

function setBudgetUsed(date: string, count: number) {
  const key = `${AUTO_SCAN_BUDGET_KEY_PREFIX}:${date}`;
  testDb.insert(appSetting).values({ key, value: String(count) })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: String(count) } }).run();
}

function queuedKeys(): string[] {
  return testDb
    .select({ jiraKey: deprecationScanQueue.jiraKey })
    .from(deprecationScanQueue)
    .all()
    .map((r) => r.jiraKey);
}

function readBudget(date: string): number {
  const key = `${AUTO_SCAN_BUDGET_KEY_PREFIX}:${date}`;
  const row = testDb.select({ value: appSetting.value }).from(appSetting)
    .where(eq(appSetting.key, key)).get();
  return row ? parseInt(row.value, 10) : 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runAutoEnqueue", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("does nothing when auto scan is disabled", async () => {
    enableAutoScan(false);
    seedTicket("BT-1", { scanOverall: 0.9 });
    const result = await runAutoEnqueue();
    expect(result.skipped).toBe(true);
    expect(queuedKeys()).toHaveLength(0);
  });

  it("does nothing when no setting exists (defaults to disabled)", async () => {
    seedTicket("BT-1", { scanOverall: 0.9 });
    const result = await runAutoEnqueue();
    expect(result.skipped).toBe(true);
    expect(queuedKeys()).toHaveLength(0);
  });

  it("enqueues up to dailyCount tickets when enabled", async () => {
    enableAutoScan(true, 3);
    seedTicket("BT-A", { scanOverall: 0.9 });
    seedTicket("BT-B", { scanOverall: 0.7 });
    seedTicket("BT-C", { scanOverall: 0.5 });
    seedTicket("BT-D", { scanOverall: 0.3 });

    const result = await runAutoEnqueue();
    expect(result.enqueued).toBe(3);
    // Worst-staleness order: A > B > C (highest score first).
    expect(queuedKeys()).toEqual(expect.arrayContaining(["BT-A", "BT-B", "BT-C"]));
    expect(queuedKeys()).not.toContain("BT-D");
  });

  it("uses worst-staleness ordering", async () => {
    enableAutoScan(true, 2);
    seedTicket("BT-LO", { scanOverall: 0.1 });
    seedTicket("BT-HI", { scanOverall: 0.95 });
    seedTicket("BT-MID", { scanOverall: 0.55 });

    await runAutoEnqueue();
    expect(queuedKeys()).toContain("BT-HI");
    expect(queuedKeys()).toContain("BT-MID");
    expect(queuedKeys()).not.toContain("BT-LO");
  });

  it("respects the dismiss cooldown", async () => {
    enableAutoScan(true, 5);
    seedTicket("BT-OK", { scanOverall: 0.5 });
    seedTicket("BT-COOL", {
      scanOverall: 1.0,
      disposition: "dismissed",
      dispositionUntil: new Date(Date.now() + 86400000).toISOString(),
    });

    await runAutoEnqueue();
    expect(queuedKeys()).toContain("BT-OK");
    expect(queuedKeys()).not.toContain("BT-COOL");
  });

  it("enqueues a dismissed ticket whose cooldown has elapsed", async () => {
    enableAutoScan(true, 5);
    seedTicket("BT-PAST", {
      scanOverall: 0.9,
      disposition: "dismissed",
      dispositionUntil: new Date(Date.now() - 1000).toISOString(),
    });

    await runAutoEnqueue();
    expect(queuedKeys()).toContain("BT-PAST");
  });

  it("enforces daily budget across multiple ticks in the same day", async () => {
    const today = utcDateKey();
    enableAutoScan(true, 5);
    // Simulate that 4 tickets were already enqueued today.
    setBudgetUsed(today, 4);
    seedTicket("BT-1", { scanOverall: 0.9 });
    seedTicket("BT-2", { scanOverall: 0.8 });
    seedTicket("BT-3", { scanOverall: 0.7 });

    const result = await runAutoEnqueue();
    // Only 1 ticket should be enqueued (budget: 5 - 4 = 1 remaining).
    expect(result.enqueued).toBe(1);
    expect(queuedKeys()).toHaveLength(1);
  });

  it("skips the tick when the daily budget is already exhausted", async () => {
    const today = utcDateKey();
    enableAutoScan(true, 5);
    setBudgetUsed(today, 5);
    seedTicket("BT-1", { scanOverall: 0.9 });

    const result = await runAutoEnqueue();
    expect(result.skipped).toBe(true);
    expect(queuedKeys()).toHaveLength(0);
  });

  it("increments the budget counter after each enqueue run", async () => {
    const today = utcDateKey();
    enableAutoScan(true, 10);
    seedTicket("BT-X1", { scanOverall: 0.9 });
    seedTicket("BT-X2", { scanOverall: 0.8 });

    await runAutoEnqueue();
    expect(readBudget(today)).toBe(2);

    // Second tick: idempotent enqueue means 0 new tickets, but counter
    // should not increment beyond what was actually enqueued.
    const result2 = await runAutoEnqueue();
    expect(result2.enqueued).toBe(0);
    // Counter stays at 2 (no new tickets were actually enqueued).
    expect(readBudget(today)).toBe(2);
  });

  it("does not enqueue tickets that are in a sprint", async () => {
    enableAutoScan(true, 10);
    seedTicket("BT-SPRINT", { sprintName: "42", scanOverall: 0.99 });
    seedTicket("BT-BACKLOG", { scanOverall: 0.5 });

    await runAutoEnqueue();
    expect(queuedKeys()).not.toContain("BT-SPRINT");
    expect(queuedKeys()).toContain("BT-BACKLOG");
  });

  it("enqueues with source 'auto'", async () => {
    enableAutoScan(true, 5);
    seedTicket("BT-SRC", { scanOverall: 0.7 });

    await runAutoEnqueue();
    const row = testDb
      .select({ source: deprecationScanQueue.source })
      .from(deprecationScanQueue)
      .where(eq(deprecationScanQueue.jiraKey, "BT-SRC"))
      .get();
    expect(row?.source).toBe("auto");
  });

  it("returns enqueued count 0 when eligible list is empty", async () => {
    enableAutoScan(true, 10);
    // No tickets seeded.
    const result = await runAutoEnqueue();
    expect(result.enqueued).toBe(0);
  });
});

describe("utcDateKey", () => {
  it("returns a YYYY-MM-DD string for a known timestamp", () => {
    // 2026-06-04T12:00:00Z = 1780574400000
    expect(utcDateKey(1780574400000)).toBe("2026-06-04");
  });
});
