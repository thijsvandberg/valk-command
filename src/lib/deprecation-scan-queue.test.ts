// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { deprecationScanQueue, ticket } from "@/db/schema";
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
  listQueue,
  removeQueueItem,
  clearPendingQueue,
} from "./deprecation-scan-queue";

function seedTicket(key: string, title = `Ticket ${key}`, status = "Backlog", type: string | null = "story") {
  testDb.insert(ticket).values({ jiraKey: key, title, status, type }).run();
}

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

  it("never claims a subtask-typed row (cleaned up with its parent)", async () => {
    // A stale subtask row sitting in the queue must be skipped by the runner so a
    // subtask is never deep-scanned on its own; a null-typed row stays claimable.
    seedTicket("PARENT-1", "Parent", "Backlog", "story");
    seedTicket("SUB-1", "Subtask", "Backlog", "subtask");
    seedTicket("GHOST-1", "Gone", "Backlog", null);
    await enqueueDeepScan(["PARENT-1", "SUB-1", "GHOST-1"]);

    const batch = await claimPendingBatch(10);
    const claimed = batch.map((r) => r.jiraKey).sort();
    expect(claimed).toEqual(["GHOST-1", "PARENT-1"]);
    expect(claimed).not.toContain("SUB-1");
    // The skipped subtask row stays pending (not silently consumed).
    const stillPending = testDb
      .select()
      .from(deprecationScanQueue)
      .where(eq(deprecationScanQueue.status, "pending"))
      .all();
    expect(stillPending.map((r) => r.jiraKey)).toEqual(["SUB-1"]);
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

  describe("listQueue", () => {
    it("returns pending+running rows with the joined ticket title and status", async () => {
      seedTicket("BT-1", "Old login flow", "In Progress");
      await enqueueDeepScan(["BT-1"], "manual");

      const items = await listQueue();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        jiraKey: "BT-1",
        status: "pending",
        source: "manual",
        title: "Old login flow",
        ticketStatus: "In Progress",
      });
      expect(items[0].enqueuedAt).toBeTruthy();
    });

    it("returns a null title when the ticket no longer exists locally", async () => {
      await enqueueDeepScan(["GHOST-1"]);
      const items = await listQueue();
      expect(items[0].title).toBeNull();
      expect(items[0].ticketStatus).toBeNull();
    });

    it("includes recent done/error rows alongside the active queue", async () => {
      seedTicket("BT-1");
      seedTicket("BT-2");
      await enqueueDeepScan(["BT-1", "BT-2"]);
      const [row] = await claimPendingBatch(1); // BT-1 -> running
      await markDone(row.id); // BT-1 -> done

      const items = await listQueue();
      const byKey = (k: string) => items.find((i) => i.jiraKey === k);
      expect(byKey("BT-1")?.status).toBe("done");
      expect(byKey("BT-2")?.status).toBe("pending");
    });

    it("excludes subtask-typed rows even when a stale queue row exists", async () => {
      // Going-forward guard: eligibility blocks new subtask enqueues, but a stale
      // row (or a ticket re-typed to subtask after enqueue) must never surface.
      seedTicket("PARENT-1", "Parent story", "Backlog", "story");
      seedTicket("SUB-1", "A subtask", "Backlog", "subtask");
      seedTicket("GHOST-1", "Deleted-locally ticket", "Backlog", null); // null type stays visible
      await enqueueDeepScan(["PARENT-1", "SUB-1", "GHOST-1"]);

      const items = await listQueue();
      const keys = items.map((i) => i.jiraKey).sort();
      expect(keys).toEqual(["GHOST-1", "PARENT-1"]);
      expect(keys).not.toContain("SUB-1");
    });

    it("caps recent done/error rows via recentLimit (active rows never truncated)", async () => {
      // Two completed rows; recentLimit 1 keeps only the newest completed one.
      seedTicket("BT-A");
      seedTicket("BT-B");
      await enqueueDeepScan(["BT-A"]);
      let [r] = await claimPendingBatch(1);
      await markError(r.id, "boom");
      await enqueueDeepScan(["BT-B"]);
      [r] = await claimPendingBatch(1);
      await markDone(r.id);

      const items = await listQueue({ recentLimit: 1 });
      const completed = items.filter((i) => i.status === "done" || i.status === "error");
      expect(completed).toHaveLength(1);
    });
  });

  describe("removeQueueItem", () => {
    it("removes a pending item by jiraKey", async () => {
      await enqueueDeepScan(["BT-1"]);
      const result = await removeQueueItem("BT-1");
      expect(result).toBe("removed");
      const counts = await queueStatusCounts();
      expect(counts.pending).toBe(0);
    });

    it("removes a pending item by row id", async () => {
      await enqueueDeepScan(["BT-1"]);
      const [row] = testDb.select().from(deprecationScanQueue).all();
      const result = await removeQueueItem(row.id);
      expect(result).toBe("removed");
    });

    it("refuses to remove a running item (returns 'running')", async () => {
      await enqueueDeepScan(["BT-1"]);
      await claimPendingBatch(1); // BT-1 -> running
      const result = await removeQueueItem("BT-1");
      expect(result).toBe("running");
      const counts = await queueStatusCounts();
      expect(counts.running).toBe(1);
    });

    it("returns 'not_found' for an unknown / non-active key", async () => {
      expect(await removeQueueItem("NOPE-9")).toBe("not_found");
    });
  });

  describe("clearPendingQueue", () => {
    it("removes all pending rows and leaves running rows intact", async () => {
      await enqueueDeepScan(["BT-1", "BT-2", "BT-3"]);
      await claimPendingBatch(1); // BT-1 -> running

      const removed = await clearPendingQueue();
      expect(removed).toBe(2);

      const counts = await queueStatusCounts();
      expect(counts.pending).toBe(0);
      expect(counts.running).toBe(1);
    });

    it("returns 0 when nothing is pending", async () => {
      expect(await clearPendingQueue()).toBe(0);
    });
  });
});
