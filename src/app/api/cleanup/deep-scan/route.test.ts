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

import { GET, POST } from "./route";

function seed(
  key: string,
  opts: {
    sprintName?: string | null;
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
});
