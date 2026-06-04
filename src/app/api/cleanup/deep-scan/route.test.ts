// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, deprecationScanQueue } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, POST, DELETE } from "./route";

function seed(
  key: string,
  opts: {
    sprintName?: string | null;
    removedFromJiraAt?: string | null;
    scanOverall?: number | null;
    lastScannedAt?: string | null;
    disposition?: string | null;
    dispositionUntil?: string | null;
    type?: string | null;
  } = {},
) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Ticket ${key}`,
    status: "Backlog",
    type: opts.type ?? null,
    sprintName: opts.sprintName === undefined ? "" : opts.sprintName,
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

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost:3100/api/cleanup/deep-scan", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }));
}

describe("POST /api/cleanup/deep-scan", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("rejects an invalid method", async () => {
    const res = await post({ method: "bogus" });
    expect(res.status).toBe(400);
  });

  it("enqueues explicit keys, filtered to the eligible backlog", async () => {
    seed("BT-1");
    seed("BT-2", { sprintName: "5" }); // in a sprint -> not eligible
    const res = await post({ method: "keys", keys: ["BT-1", "BT-2", "GHOST-9"] });
    const data = await res.json();
    expect(data.enqueuedKeys).toEqual(["BT-1"]);
    expect(data.enqueued).toBe(1);
  });

  it("is idempotent across calls", async () => {
    seed("BT-1");
    await post({ method: "keys", keys: ["BT-1"] });
    const second = await (await post({ method: "keys", keys: ["BT-1"] })).json();
    expect(second.enqueued).toBe(0);
    const rows = testDb.select().from(deprecationScanQueue).where(eq(deprecationScanQueue.jiraKey, "BT-1")).all();
    expect(rows).toHaveLength(1);
  });

  it("worst-staleness queues the highest-overall tickets up to topX", async () => {
    seed("BT-LO", { scanOverall: 0.2 });
    seed("BT-HI", { scanOverall: 0.95 });
    seed("BT-MID", { scanOverall: 0.6 });
    const data = await (await post({ method: "worst-staleness", topX: 2 })).json();
    expect(data.enqueuedKeys).toEqual(["BT-HI", "BT-MID"]);
  });

  it("oldest queues never-scanned then oldest-scanned up to topX", async () => {
    seed("BT-NEW", { lastScannedAt: "2026-06-03T00:00:00Z" });
    seed("BT-NEVER");
    seed("BT-OLD", { lastScannedAt: "2026-01-01T00:00:00Z" });
    const data = await (await post({ method: "oldest", topX: 2 })).json();
    expect(data.enqueuedKeys).toEqual(["BT-NEVER", "BT-OLD"]);
  });

  it("ranked methods exclude dismissed tickets still in cooldown", async () => {
    seed("BT-OK", { scanOverall: 0.5 });
    seed("BT-COOL", {
      scanOverall: 1,
      disposition: "dismissed",
      dispositionUntil: new Date(Date.now() + 86400000).toISOString(),
    });
    const data = await (await post({ method: "worst-staleness", topX: 5 })).json();
    expect(data.enqueuedKeys).toEqual(["BT-OK"]);
  });

  it("excludes subtasks from enqueue eligibility (subtasks are cleaned up with their parent)", async () => {
    seed("BT-STORY", { type: "story" });
    seed("BT-BUG", { type: "bug" });
    // Subtasks must not be queued for deep scanning.
    seed("BT-SUB", { type: "subtask" });

    const data = await (await post({ method: "keys", keys: ["BT-STORY", "BT-BUG", "BT-SUB"] })).json();
    expect(data.enqueuedKeys.sort()).toEqual(["BT-BUG", "BT-STORY"]);
    expect(data.enqueuedKeys).not.toContain("BT-SUB");
  });

  it("includes tickets with null type in enqueue eligibility (unknown types are not silently hidden)", async () => {
    seed("BT-NULL", { type: null });
    const data = await (await post({ method: "keys", keys: ["BT-NULL"] })).json();
    expect(data.enqueuedKeys).toEqual(["BT-NULL"]);
  });
});

describe("GET /api/cleanup/deep-scan", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns queue status counts", async () => {
    seed("BT-1");
    await post({ method: "keys", keys: ["BT-1"] });
    const data = await (await GET()).json();
    expect(data).toMatchObject({ pending: 1, running: 0, done: 0, error: 0 });
  });

  it("returns the queue items[] with joined title alongside counts", async () => {
    seed("BT-1");
    await post({ method: "keys", keys: ["BT-1"] });
    const data = await (await GET()).json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      jiraKey: "BT-1",
      status: "pending",
      title: "Ticket BT-1",
    });
  });
});

function del(opts: { body?: unknown; query?: string } = {}): Promise<Response> {
  const url = `http://localhost:3100/api/cleanup/deep-scan${opts.query ?? ""}`;
  return DELETE(new Request(url, {
    method: "DELETE",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    headers: { "Content-Type": "application/json" },
  }));
}

describe("DELETE /api/cleanup/deep-scan", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("removes a single pending item by key", async () => {
    seed("BT-1");
    await post({ method: "keys", keys: ["BT-1"] });
    const res = await del({ body: { key: "BT-1" } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ removed: true, key: "BT-1" });
    expect(data.queue.pending).toBe(0);
  });

  it("returns 404 when the key has no active item", async () => {
    const res = await del({ body: { key: "NOPE-1" } });
    expect(res.status).toBe(404);
  });

  it("clears all pending items with { all: true }", async () => {
    seed("BT-1");
    seed("BT-2");
    await post({ method: "keys", keys: ["BT-1", "BT-2"] });
    const res = await del({ body: { all: true } });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ cleared: true, removed: 2 });
    expect(data.queue.pending).toBe(0);
  });

  it("clears all pending items with ?all=1", async () => {
    seed("BT-1");
    await post({ method: "keys", keys: ["BT-1"] });
    const res = await del({ query: "?all=1" });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ cleared: true, removed: 1 });
  });

  it("rejects an invalid delete body", async () => {
    const res = await del({ body: { foo: "bar" } });
    expect(res.status).toBe(400);
  });
});
