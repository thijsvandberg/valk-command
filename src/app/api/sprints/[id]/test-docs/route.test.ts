// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

import { GET } from "./route";
import { ticket, ticketMetadata, ticketSprint, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";

const SPRINT = "6361";

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(id: string): Request {
  return new Request(`http://localhost:3100/api/sprints/${id}/test-docs`);
}

function seedTicket(
  key: string,
  opts: {
    status?: string;
    type?: string;
    storyPoints?: number | null;
    sprintId?: string | null;
    removed?: boolean;
    doc?: string;
    classification?: string;
  } = {},
) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Title ${key}`,
    type: opts.type ?? "story",
    status: opts.status ?? "DONE",
    storyPoints: opts.storyPoints ?? null,
    removedFromJiraAt: opts.removed ? "2026-07-01T00:00:00.000Z" : null,
  }).run();
  const sprintId = opts.sprintId === undefined ? SPRINT : opts.sprintId;
  if (sprintId) {
    testDb.insert(ticketSprint).values({ ticketKey: key, sprintId }).run();
  }
  if (opts.doc) {
    testDb.insert(ticketMetadata).values({
      jiraKey: key,
      testDoc: opts.doc,
      testDocUpdatedAt: "2026-07-01T00:00:00.000Z",
      testDocClassification: opts.classification ?? "ok",
    }).run();
  }
}

async function fetchBuckets(id: string = SPRINT) {
  const response = await GET(makeRequest(id), makeParams(id));
  expect(response.status).toBe(200);
  return response.json();
}

describe("GET /api/sprints/[id]/test-docs", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(sprintNameCache).values({ sprintId: SPRINT, displayName: "BT: 139" }).run();
  });

  it("buckets documented, internal, notNeeded, missing and other correctly", async () => {
    seedTicket("VPL-1", { doc: "**Doc 1**", classification: "ok", storyPoints: 3 });
    seedTicket("VPL-2", { doc: "Internal one-liner", classification: "not_stakeholder_relevant" });
    seedTicket("VPL-3", { status: "TEST" });
    seedTicket("VPL-4", { status: "DONE" });
    seedTicket("VPL-5", { status: "IN PROGRESS" });
    // Explicit "no doc needed" marker: classification without a doc. Must land
    // in notNeeded, NOT in missing, despite being DONE.
    seedTicket("VPL-6", { status: "DONE" });
    testDb.insert(ticketMetadata).values({
      jiraKey: "VPL-6",
      testDocClassification: "not_stakeholder_relevant",
    }).run();

    const data = await fetchBuckets();
    expect(data.sprintName).toBe("BT: 139");
    expect(data.documented.map((d: { key: string }) => d.key)).toEqual(["VPL-1"]);
    expect(data.internal.map((d: { key: string }) => d.key)).toEqual(["VPL-2"]);
    expect(data.notNeeded.map((d: { key: string }) => d.key)).toEqual(["VPL-6"]);
    expect(data.missing.map((d: { key: string }) => d.key).sort()).toEqual(["VPL-3", "VPL-4"]);
    expect(data.other.map((d: { key: string }) => d.key)).toEqual(["VPL-5"]);
  });

  it("orders documented by story points desc, nulls last, then key", async () => {
    seedTicket("VPL-9", { doc: "small", storyPoints: 2 });
    seedTicket("VPL-8", { doc: "big", storyPoints: 8 });
    seedTicket("VPL-7", { doc: "no sp", storyPoints: null });

    const data = await fetchBuckets();
    expect(data.documented.map((d: { key: string }) => d.key)).toEqual(["VPL-8", "VPL-9", "VPL-7"]);
  });

  it("flags needs_input docs and treats null classification as ok", async () => {
    seedTicket("VPL-1", { doc: "flagged", classification: "needs_input" });
    seedTicket("VPL-2", { doc: "legacy" });
    testDb
      .update(ticketMetadata)
      .set({ testDocClassification: null })
      .where(eq(ticketMetadata.jiraKey, "VPL-2"))
      .run();

    const data = await fetchBuckets();
    const byKey = Object.fromEntries(
      data.documented.map((d: { key: string; needsInput?: boolean }) => [d.key, d.needsInput]),
    );
    expect(byKey["VPL-1"]).toBe(true);
    expect(byKey["VPL-2"]).toBe(false);
  });

  it("excludes subtasks, epics, removed tickets, draft statuses, deprecated and other sprints", async () => {
    seedTicket("VPL-1", { type: "subtask" });
    seedTicket("VPL-2", { type: "epic" });
    seedTicket("VPL-3", { removed: true });
    seedTicket("VPL-4", { status: "DRAFTING" });
    seedTicket("VPL-5", { sprintId: "9999" });
    seedTicket("VPL-7", { status: "DEPRECATED" });
    seedTicket("VPL-6", {});

    const data = await fetchBuckets();
    const allKeys = [...data.documented, ...data.internal, ...data.missing, ...data.other].map(
      (d: { key: string }) => d.key,
    );
    expect(allKeys).toEqual(["VPL-6"]);
  });

  it("falls back to a generic sprint name when uncached", async () => {
    const data = await fetchBuckets("777");
    expect(data.sprintName).toBe("Sprint 777");
    expect(data.documented).toEqual([]);
  });
});
