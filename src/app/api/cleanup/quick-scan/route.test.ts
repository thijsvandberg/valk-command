// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { POST } from "./route";

function seed(
  key: string,
  opts: {
    sprintName?: string | null;
    removedFromJiraAt?: string | null;
    status?: string;
    type?: string | null;
    updated?: string;
  } = {},
) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Ticket ${key}`,
    status: opts.status ?? "Backlog",
    type: opts.type ?? null,
    sprintName: opts.sprintName === undefined ? "" : opts.sprintName,
    removedFromJiraAt: opts.removedFromJiraAt ?? null,
    jiraUpdatedAt: opts.updated ?? new Date(Date.now() - 600 * 86400000).toISOString(),
  }).run();
}

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost:3100/api/cleanup/quick-scan", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }));
}

describe("POST /api/cleanup/quick-scan", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("rejects a missing keys array", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("rejects an empty keys array", async () => {
    const res = await post({ keys: [] });
    expect(res.status).toBe(400);
  });

  it("rejects more than the cap of 200 keys", async () => {
    const keys = Array.from({ length: 201 }, (_, i) => `BT-${i}`);
    const res = await post({ keys });
    expect(res.status).toBe(400);
  });

  it("scores eligible keys synchronously and returns counts", async () => {
    seed("BT-1");
    seed("BT-2");

    const res = await post({ keys: ["BT-1", "BT-2"] });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ scored: 2, skipped: 0 });
    // Scores are written immediately (no queue).
    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta?.scanOverall).not.toBeNull();
    expect(meta?.lastScannedAt).toBeTruthy();
  });

  it("skips ineligible keys (in-sprint, subtask, unknown) and counts them", async () => {
    seed("BT-OK");
    seed("BT-SPRINT", { sprintName: "5" });
    seed("BT-SUB", { type: "subtask" });

    const data = await (await post({ keys: ["BT-OK", "BT-SPRINT", "BT-SUB", "GHOST-9"] })).json();
    expect(data.scored).toBe(1);
    expect(data.skipped).toBe(3);
  });
});
