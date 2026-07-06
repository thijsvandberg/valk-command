// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, sprintNameCache } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { getBookmarks } from "./bookmarks";

function seedTicket(key: string, sprintName: string | null = null, type = "story") {
  testDb
    .insert(ticket)
    .values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO", type, sprintName })
    .run();
}

describe("getBookmarks", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns only bookmarked tickets, most-recently-bookmarked first", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    seedTicket("VPL-3");
    testDb.insert(ticketMetadata).values([
      { jiraKey: "VPL-1", bookmarkedAt: "2026-07-01T10:00:00.000Z" },
      { jiraKey: "VPL-2", bookmarkedAt: "2026-07-03T10:00:00.000Z" },
      // VPL-3 has metadata but is NOT bookmarked.
      { jiraKey: "VPL-3", poNotes: "not bookmarked" },
    ]).run();

    const result = await getBookmarks();
    expect(result.map((b) => b.key)).toEqual(["VPL-2", "VPL-1"]);
  });

  it("includes a bookmarked backlog ticket (no sprint) with null sprintName", async () => {
    seedTicket("VPL-10", null);
    testDb.insert(ticketMetadata).values({ jiraKey: "VPL-10", bookmarkedAt: "2026-07-02T10:00:00.000Z" }).run();

    const result = await getBookmarks();
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("VPL-10");
    expect(result[0].sprintName).toBeNull();
  });

  it("resolves the sprint display name from the sprint name cache", async () => {
    seedTicket("VPL-20", "4238");
    testDb.insert(sprintNameCache).values({ sprintId: "4238", displayName: "Sprint 42" }).run();
    testDb.insert(ticketMetadata).values({ jiraKey: "VPL-20", bookmarkedAt: "2026-07-02T10:00:00.000Z" }).run();

    const result = await getBookmarks();
    expect(result[0].sprintName).toBe("Sprint 42");
  });

  it("carries the PO note so the list can reveal it, and excludes subtasks", async () => {
    seedTicket("VPL-30", null, "story");
    seedTicket("VPL-31", null, "subtask");
    testDb.insert(ticketMetadata).values([
      { jiraKey: "VPL-30", bookmarkedAt: "2026-07-04T10:00:00.000Z", poNotes: "revisit after spike" },
      { jiraKey: "VPL-31", bookmarkedAt: "2026-07-05T10:00:00.000Z" },
    ]).run();

    const result = await getBookmarks();
    expect(result.map((b) => b.key)).toEqual(["VPL-30"]);
    expect(result[0].notes).toBe("revisit after spike");
  });

  it("keeps a bookmarked epic (BRDG-481) but still drops subtasks", async () => {
    seedTicket("VPL-40", null, "epic");
    seedTicket("VPL-41", null, "subtask");
    testDb.insert(ticketMetadata).values([
      { jiraKey: "VPL-40", bookmarkedAt: "2026-07-06T10:00:00.000Z" },
      { jiraKey: "VPL-41", bookmarkedAt: "2026-07-06T11:00:00.000Z" },
    ]).run();

    const result = await getBookmarks();
    expect(result.map((b) => b.key)).toEqual(["VPL-40"]);
    expect(result[0].type).toBe("epic");
  });
});
