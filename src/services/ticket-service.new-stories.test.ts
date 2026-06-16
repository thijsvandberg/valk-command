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
  updateTicketMetadata,
  bulkMarkNewStoriesRead,
} from "@/services/ticket-service";
import { ValidationError } from "@/services/errors";

function seedTicket(key: string) {
  testDb.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function readState(key: string): string | null {
  const row = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get();
  return row?.newStoryReadAt ?? null;
}

describe("updateTicketMetadata newStoryRead (BRDG-356)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    invalidate.mockClear();
  });

  it("stamps newStoryReadAt when marked read", async () => {
    seedTicket("VPL-1");
    const result = await updateTicketMetadata("VPL-1", { newStoryRead: true });
    expect(result.newStoryReadAt).toBeTruthy();
  });

  it("clears newStoryReadAt back to null when marked unread", async () => {
    seedTicket("VPL-1");
    await updateTicketMetadata("VPL-1", { newStoryRead: true });
    const result = await updateTicketMetadata("VPL-1", { newStoryRead: false });
    expect(result.newStoryReadAt).toBeNull();
  });

  it("rejects a non-boolean newStoryRead", async () => {
    seedTicket("VPL-1");
    await expect(
      updateTicketMetadata("VPL-1", { newStoryRead: "yes" as unknown as boolean }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("invalidates the new-stories cache on a read toggle", async () => {
    seedTicket("VPL-1");
    await updateTicketMetadata("VPL-1", { newStoryRead: true });
    const invalidatedNewStories = invalidate.mock.calls.some(
      ([arg]) => arg instanceof RegExp && arg.test("/api/new-stories"),
    );
    expect(invalidatedNewStories).toBe(true);
  });
});

describe("bulkMarkNewStoriesRead (BRDG-356)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    invalidate.mockClear();
  });

  it("marks multiple tickets read in one call (creating metadata as needed)", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    const result = await bulkMarkNewStoriesRead(["VPL-1", "VPL-2"], true);
    expect(result.updated).toBe(2);
    expect(readState("VPL-1")).toBeTruthy();
    expect(readState("VPL-2")).toBeTruthy();
  });

  it("clears read state for multiple tickets when read=false", async () => {
    seedTicket("VPL-1");
    await bulkMarkNewStoriesRead(["VPL-1"], true);
    await bulkMarkNewStoriesRead(["VPL-1"], false);
    expect(readState("VPL-1")).toBeNull();
  });

  it("skips unknown keys without creating orphan metadata", async () => {
    seedTicket("VPL-1");
    const result = await bulkMarkNewStoriesRead(["VPL-1", "GHOST-9"], true);
    expect(result.updated).toBe(1);
    expect(readState("GHOST-9")).toBeNull();
  });

  it("rejects non-boolean read", async () => {
    await expect(
      bulkMarkNewStoriesRead(["VPL-1"], "yes" as unknown as boolean),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
