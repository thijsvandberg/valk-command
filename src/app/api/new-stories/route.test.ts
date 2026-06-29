// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, newStoryRead } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// No caching in tests so each seed is reflected immediately.
vi.mock("@/lib/cache", () => ({
  cache: { get: () => undefined, set: () => {}, invalidate: () => {} },
}));

vi.mock("@/lib/new-stories-ctx", () => ({
  resolveNewStoryQueryCtx: async () => ({ userId: "user-a", jiraAccountId: null, jiraName: null }),
}));

vi.mock("@/lib/new-story-read-store", () => ({
  backfillLegacyNewStoryReads: async () => {},
}));

import { GET } from "./route";

function seedTicket(key: string, createdAt: string) {
  testDb
    .insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
      type: "story",
      reporter: "Alice",
      reporterAccountId: null,
      assignee: null,
      jiraCreatedAt: createdAt,
      removedFromJiraAt: null,
    })
    .run();
}

function seedRead(userId: string, ticketKey: string, readAt: string) {
  testDb.insert(newStoryRead).values({ userId, ticketKey, readAt }).run();
}

describe("GET /api/new-stories baselineAt (BRDG-438)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns baselineAt = MAX(readAt) for the acting user only", async () => {
    seedTicket("VPL-1", "2026-06-16T10:00:00Z");
    seedRead("user-a", "VPL-1", "2026-06-10T09:00:00Z");
    seedRead("user-a", "VPL-2", "2026-06-12T09:00:00Z");
    // A different user's later read must not leak into user-a's baseline.
    seedRead("user-b", "VPL-3", "2026-06-20T09:00:00Z");

    const res = await GET();
    const body = await res.json();
    expect(body.baselineAt).toBe("2026-06-12T09:00:00Z");
  });

  it("returns null baselineAt when the user has never marked anything read", async () => {
    seedTicket("VPL-1", "2026-06-16T10:00:00Z");

    const res = await GET();
    const body = await res.json();
    expect(body.baselineAt).toBeNull();
    expect(Array.isArray(body.rows)).toBe(true);
  });
});
