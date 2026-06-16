// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, newStoryRead, appSetting } from "@/db/schema";
import { and, eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  markNewStoryRead,
  bulkMarkNewStoriesRead,
  getReadTicketKeys,
  backfillLegacyNewStoryReads,
} from "@/lib/new-story-read-store";

function seedTicket(key: string) {
  testDb.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function readAt(userId: string, key: string): string | null {
  const row = testDb
    .select()
    .from(newStoryRead)
    .where(and(eq(newStoryRead.userId, userId), eq(newStoryRead.ticketKey, key)))
    .get();
  return row?.readAt ?? null;
}

describe("markNewStoryRead (BRDG-359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    seedTicket("VPL-1");
  });

  it("inserts a read row when marked read", async () => {
    await markNewStoryRead("user-a", "VPL-1", true);
    expect(readAt("user-a", "VPL-1")).toBeTruthy();
  });

  it("deletes the read row when marked unread", async () => {
    await markNewStoryRead("user-a", "VPL-1", true);
    await markNewStoryRead("user-a", "VPL-1", false);
    expect(readAt("user-a", "VPL-1")).toBeNull();
  });

  it("re-marking read does not throw (upsert) and refreshes readAt", async () => {
    await markNewStoryRead("user-a", "VPL-1", true);
    await expect(markNewStoryRead("user-a", "VPL-1", true)).resolves.toBeUndefined();
    expect(readAt("user-a", "VPL-1")).toBeTruthy();
  });

  it("isolates read state between users", async () => {
    await markNewStoryRead("user-a", "VPL-1", true);
    expect(readAt("user-a", "VPL-1")).toBeTruthy();
    expect(readAt("user-b", "VPL-1")).toBeNull();
  });
});

describe("bulkMarkNewStoriesRead (BRDG-359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    seedTicket("VPL-1");
    seedTicket("VPL-2");
  });

  it("marks only keys that resolve to a real ticket", async () => {
    const result = await bulkMarkNewStoriesRead("user-a", ["VPL-1", "VPL-2", "GHOST-9"], true);
    expect(result.updated).toBe(2);
    expect(readAt("user-a", "VPL-1")).toBeTruthy();
    expect(readAt("user-a", "VPL-2")).toBeTruthy();
    expect(readAt("user-a", "GHOST-9")).toBeNull();
  });

  it("deduplicates repeated keys", async () => {
    const result = await bulkMarkNewStoriesRead("user-a", ["VPL-1", "VPL-1"], true);
    expect(result.updated).toBe(1);
  });

  it("clears read state when read=false", async () => {
    await bulkMarkNewStoriesRead("user-a", ["VPL-1", "VPL-2"], true);
    await bulkMarkNewStoriesRead("user-a", ["VPL-1"], false);
    expect(readAt("user-a", "VPL-1")).toBeNull();
    expect(readAt("user-a", "VPL-2")).toBeTruthy();
  });

  it("returns 0 for an empty key list", async () => {
    expect((await bulkMarkNewStoriesRead("user-a", [], true)).updated).toBe(0);
  });
});

describe("getReadTicketKeys (BRDG-359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    seedTicket("VPL-1");
    seedTicket("VPL-2");
  });

  it("returns only the given user's read keys", async () => {
    await markNewStoryRead("user-a", "VPL-1", true);
    await markNewStoryRead("user-b", "VPL-2", true);
    expect((await getReadTicketKeys("user-a")).sort()).toEqual(["VPL-1"]);
    expect((await getReadTicketKeys("user-b")).sort()).toEqual(["VPL-2"]);
  });
});

describe("backfillLegacyNewStoryReads (BRDG-359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    seedTicket("VPL-3");
  });

  function seedLegacyRead(key: string, readAtIso: string) {
    testDb.insert(ticketMetadata).values({ jiraKey: key, newStoryReadAt: readAtIso }).run();
  }

  it("copies legacy read flags into the per-user store for the given user", async () => {
    seedLegacyRead("VPL-1", "2026-06-10T10:00:00Z");
    seedLegacyRead("VPL-2", "2026-06-11T10:00:00Z");
    await backfillLegacyNewStoryReads("user-a");
    expect(readAt("user-a", "VPL-1")).toBe("2026-06-10T10:00:00Z");
    expect(readAt("user-a", "VPL-2")).toBe("2026-06-11T10:00:00Z");
    expect(readAt("user-a", "VPL-3")).toBeNull();
  });

  it("runs only once (guard flag), so a second user does not re-inherit", async () => {
    seedLegacyRead("VPL-1", "2026-06-10T10:00:00Z");
    await backfillLegacyNewStoryReads("user-a");
    await backfillLegacyNewStoryReads("user-b");
    expect(readAt("user-a", "VPL-1")).toBeTruthy();
    expect(readAt("user-b", "VPL-1")).toBeNull();
    const flag = testDb
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, "new_story_read_backfilled"))
      .get();
    expect(flag).toBeTruthy();
  });

  it("does not clobber an existing per-user read row", async () => {
    seedLegacyRead("VPL-1", "2026-06-10T10:00:00Z");
    await markNewStoryRead("user-a", "VPL-1", true);
    const before = readAt("user-a", "VPL-1");
    await backfillLegacyNewStoryReads("user-a");
    expect(readAt("user-a", "VPL-1")).toBe(before);
  });

  it("is a no-op when there are no legacy reads but still sets the guard", async () => {
    await backfillLegacyNewStoryReads("user-a");
    const flag = testDb
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, "new_story_read_backfilled"))
      .get();
    expect(flag).toBeTruthy();
  });
});
