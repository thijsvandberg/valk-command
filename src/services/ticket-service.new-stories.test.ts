// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, newStoryRead } from "@/db/schema";
import { and, eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: { get isLive() { return false; }, getIssue: vi.fn(), updateIssue: vi.fn() },
  FLAGGED_FIELD: "customfield_10002",
  JiraApiError: class JiraApiError extends Error {},
}));

vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "http://localhost:3100" } }));

const invalidate = vi.fn();
vi.mock("@/lib/cache", () => ({ cache: { invalidate: (...args: unknown[]) => invalidate(...args) } }));

vi.mock("@/lib/sync-tickets-service", () => ({
  syncIndividualTickets: vi.fn().mockResolvedValue(undefined),
  ingestIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

import {
  markNewStoryReadForUser,
  bulkMarkNewStoriesRead,
} from "@/services/ticket-service";
import { ValidationError, NotFoundError } from "@/services/errors";

function seedTicket(key: string) {
  testDb.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function readState(userId: string, key: string): string | null {
  const row = testDb
    .select()
    .from(newStoryRead)
    .where(and(eq(newStoryRead.userId, userId), eq(newStoryRead.ticketKey, key)))
    .get();
  return row?.readAt ?? null;
}

function legacyState(key: string): string | null {
  const row = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get();
  return row?.newStoryReadAt ?? null;
}

describe("markNewStoryReadForUser (BRDG-359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    invalidate.mockClear();
  });

  it("records a per-user read row when marked read", async () => {
    seedTicket("VPL-1");
    await markNewStoryReadForUser("user-a", "VPL-1", true);
    expect(readState("user-a", "VPL-1")).toBeTruthy();
  });

  it("scopes read state to the acting user", async () => {
    seedTicket("VPL-1");
    await markNewStoryReadForUser("user-a", "VPL-1", true);
    expect(readState("user-a", "VPL-1")).toBeTruthy();
    expect(readState("user-b", "VPL-1")).toBeNull();
  });

  it("clears the per-user read row when marked unread", async () => {
    seedTicket("VPL-1");
    await markNewStoryReadForUser("user-a", "VPL-1", true);
    await markNewStoryReadForUser("user-a", "VPL-1", false);
    expect(readState("user-a", "VPL-1")).toBeNull();
  });

  it("never writes the deprecated shared metadata column", async () => {
    seedTicket("VPL-1");
    await markNewStoryReadForUser("user-a", "VPL-1", true);
    expect(legacyState("VPL-1")).toBeNull();
  });

  it("throws NotFoundError for an unknown ticket", async () => {
    await expect(
      markNewStoryReadForUser("user-a", "GHOST-9", true),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("invalidates the new-stories cache on a read toggle", async () => {
    seedTicket("VPL-1");
    await markNewStoryReadForUser("user-a", "VPL-1", true);
    const invalidatedNewStories = invalidate.mock.calls.some(
      ([arg]) => arg instanceof RegExp && arg.test("/api/new-stories"),
    );
    expect(invalidatedNewStories).toBe(true);
  });
});

describe("bulkMarkNewStoriesRead (BRDG-359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    invalidate.mockClear();
  });

  it("marks multiple tickets read for the acting user in one call", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    const result = await bulkMarkNewStoriesRead("user-a", ["VPL-1", "VPL-2"], true);
    expect(result.updated).toBe(2);
    expect(readState("user-a", "VPL-1")).toBeTruthy();
    expect(readState("user-a", "VPL-2")).toBeTruthy();
  });

  it("leaves a different user's read state untouched", async () => {
    seedTicket("VPL-1");
    await bulkMarkNewStoriesRead("user-a", ["VPL-1"], true);
    expect(readState("user-b", "VPL-1")).toBeNull();
  });

  it("clears read state for multiple tickets when read=false", async () => {
    seedTicket("VPL-1");
    await bulkMarkNewStoriesRead("user-a", ["VPL-1"], true);
    await bulkMarkNewStoriesRead("user-a", ["VPL-1"], false);
    expect(readState("user-a", "VPL-1")).toBeNull();
  });

  it("skips unknown keys without recording read state", async () => {
    seedTicket("VPL-1");
    const result = await bulkMarkNewStoriesRead("user-a", ["VPL-1", "GHOST-9"], true);
    expect(result.updated).toBe(1);
    expect(readState("user-a", "GHOST-9")).toBeNull();
  });

  it("rejects non-boolean read", async () => {
    await expect(
      bulkMarkNewStoriesRead("user-a", ["VPL-1"], "yes" as unknown as boolean),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
