// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { deprecationScanQueue } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  enqueueDeepScan,
  claimPendingBatch,
  markDone,
  markError,
  queueStatusCounts,
  requeueStuckRunning,
} from "./deprecation-scan-queue";

describe("deprecation deep-scan queue", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("enqueues new tickets and reports which were added", async () => {
    const added = await enqueueDeepScan(["BT-1", "BT-2"], "manual");
    expect(added.sort()).toEqual(["BT-1", "BT-2"]);
    const counts = await queueStatusCounts();
    expect(counts.pending).toBe(2);
  });

  it("is idempotent: does not double-queue a ticket already pending", async () => {
    await enqueueDeepScan(["BT-1"]);
    const second = await enqueueDeepScan(["BT-1", "BT-3"]);
    expect(second).toEqual(["BT-3"]);
    const counts = await queueStatusCounts();
    expect(counts.pending).toBe(2);
  });

  it("dedupes duplicate keys within a single call", async () => {
    const added = await enqueueDeepScan(["BT-9", "BT-9", "BT-9"]);
    expect(added).toEqual(["BT-9"]);
  });

  it("does not double-queue a ticket currently running", async () => {
    await enqueueDeepScan(["BT-1"]);
    await claimPendingBatch(5); // BT-1 -> running
    const again = await enqueueDeepScan(["BT-1"]);
    expect(again).toEqual([]);
  });

  it("allows re-queuing a ticket after its scan finished (done clears active_key)", async () => {
    await enqueueDeepScan(["BT-1"]);
    const [row] = await claimPendingBatch(5);
    await markDone(row.id);
    const again = await enqueueDeepScan(["BT-1"]);
    expect(again).toEqual(["BT-1"]);
  });

  it("claims pending rows oldest-first and marks them running", async () => {
    // Insert with explicit ascending enqueuedAt so FIFO order is deterministic.
    testDb.insert(deprecationScanQueue).values([
      { id: "a", jiraKey: "BT-1", activeKey: "BT-1", enqueuedAt: "2026-01-01T00:00:00Z" },
      { id: "b", jiraKey: "BT-2", activeKey: "BT-2", enqueuedAt: "2026-01-02T00:00:00Z" },
      { id: "c", jiraKey: "BT-3", activeKey: "BT-3", enqueuedAt: "2026-01-03T00:00:00Z" },
    ]).run();

    const batch = await claimPendingBatch(2);
    expect(batch.map((r) => r.jiraKey)).toEqual(["BT-1", "BT-2"]);
    expect(batch.every((r) => r.status === "running")).toBe(true);

    const remaining = testDb.select().from(deprecationScanQueue).where(eq(deprecationScanQueue.status, "pending")).all();
    expect(remaining.map((r) => r.jiraKey)).toEqual(["BT-3"]);
  });

  it("markError records the message and counts toward errors", async () => {
    await enqueueDeepScan(["BT-1"]);
    const [row] = await claimPendingBatch(5);
    await markError(row.id, "topic failed");
    const stored = testDb.select().from(deprecationScanQueue).where(eq(deprecationScanQueue.id, row.id)).get();
    expect(stored?.status).toBe("error");
    expect(stored?.error).toBe("topic failed");
    const counts = await queueStatusCounts();
    expect(counts.error).toBe(1);
  });

  it("requeues rows stuck in running back to pending (crash recovery / resume)", async () => {
    await enqueueDeepScan(["BT-1", "BT-2"]);
    await claimPendingBatch(5); // both -> running
    const recovered = await requeueStuckRunning();
    expect(recovered).toBe(2);
    const counts = await queueStatusCounts();
    expect(counts.pending).toBe(2);
    expect(counts.running).toBe(0);
  });
});
