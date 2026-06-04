// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

function seed(
  key: string,
  opts: {
    sprintName?: string | null;
    removedFromJiraAt?: string | null;
    status?: string;
    lastScannedAt?: string | null;
    scanScores?: string | null;
    scanOverall?: number | null;
    disposition?: string | null;
  } = {},
) {
  testDb
    .insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: opts.status ?? "TO DO",
      sprintName: opts.sprintName === undefined ? "" : opts.sprintName,
      removedFromJiraAt: opts.removedFromJiraAt ?? null,
    })
    .run();
  if (
    opts.lastScannedAt !== undefined ||
    opts.scanScores !== undefined ||
    opts.scanOverall !== undefined ||
    opts.disposition !== undefined
  ) {
    testDb
      .insert(ticketMetadata)
      .values({
        jiraKey: key,
        lastScannedAt: opts.lastScannedAt ?? null,
        scanScores: opts.scanScores ?? null,
        scanOverall: opts.scanOverall ?? null,
        disposition: opts.disposition ?? null,
      })
      .run();
  }
}

function call(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost:3100/api/cleanup${query}`));
}

describe("GET /api/cleanup", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty rows and the topic descriptor when nothing is eligible", async () => {
    const res = await call();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.rows).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.topics.find((t: { key: string }) => t.key === "staleness")).toMatchObject({ live: true });
  });

  it("includes only scan-eligible backlog tickets (empty sprint, not removed)", async () => {
    seed("BT-1", { sprintName: "" });
    seed("BT-2", { sprintName: "Sprint 5" }); // in a sprint -> excluded
    seed("BT-3", { sprintName: "", removedFromJiraAt: "2026-01-01T00:00:00Z" }); // removed -> excluded

    const data = await (await call()).json();
    expect(data.rows.map((r: { key: string }) => r.key)).toEqual(["BT-1"]);
  });

  it("parses scanScores into a per-topic map and surfaces overall + disposition", async () => {
    seed("BT-10", {
      lastScannedAt: "2026-06-01T00:00:00Z",
      scanScores: JSON.stringify({ staleness: { score: 0.82, evidence: "old" } }),
      scanOverall: 0.82,
      disposition: "candidate",
    });
    const data = await (await call()).json();
    const row = data.rows[0];
    expect(row.topicScores.staleness).toBeCloseTo(0.82);
    expect(row.scanOverall).toBeCloseTo(0.82);
    expect(row.disposition).toBe("candidate");
  });

  it("sorts by overall descending with never-scanned rows last", async () => {
    seed("BT-A", { scanOverall: 0.4 });
    seed("BT-B", { scanOverall: 0.9 });
    seed("BT-C", {}); // never scanned -> overall null
    const data = await (await call("?sort=overall")).json();
    expect(data.rows.map((r: { key: string }) => r.key)).toEqual(["BT-B", "BT-A", "BT-C"]);
  });

  it("sorts by last scanned oldest first", async () => {
    seed("BT-NEW", { lastScannedAt: "2026-06-03T00:00:00Z" });
    seed("BT-OLD", { lastScannedAt: "2026-01-01T00:00:00Z" });
    const data = await (await call("?sort=lastScanned-oldest")).json();
    expect(data.rows.map((r: { key: string }) => r.key)).toEqual(["BT-OLD", "BT-NEW"]);
  });

  it("filters to never-scanned tickets", async () => {
    seed("BT-S", { lastScannedAt: "2026-06-01T00:00:00Z" });
    seed("BT-N", {});
    const data = await (await call("?scanned=never")).json();
    expect(data.rows.map((r: { key: string }) => r.key)).toEqual(["BT-N"]);
  });

  it("filters by disposition", async () => {
    seed("BT-D1", { disposition: "dismissed" });
    seed("BT-D2", { disposition: "candidate" });
    const data = await (await call("?disposition=dismissed")).json();
    expect(data.rows.map((r: { key: string }) => r.key)).toEqual(["BT-D1"]);
  });

  it("filters by overall score threshold", async () => {
    seed("BT-LO", { scanOverall: 0.3 });
    seed("BT-HI", { scanOverall: 0.8 });
    const data = await (await call("?minOverall=0.6")).json();
    expect(data.rows.map((r: { key: string }) => r.key)).toEqual(["BT-HI"]);
  });
});
