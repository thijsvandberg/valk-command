// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, storyVersion } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockGetDescriptionChangelog = vi.fn();
const mockIsLive = vi.fn(() => true);

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getDescriptionChangelog: (...args: unknown[]) => mockGetDescriptionChangelog(...args),
    get isLive() {
      return mockIsLive();
    },
  },
}));

import { POST } from "./route";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
    })
    .run();
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

describe("POST /api/tickets/[key]/versions/import", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockGetDescriptionChangelog.mockReset();
    mockIsLive.mockReturnValue(true);
  });

  it("returns 503 when Jira is not configured", async () => {
    mockIsLive.mockReturnValue(false);

    const res = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/import", { method: "POST" }),
      makeParams("VPL-100"),
    );

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Jira is not configured");
  });

  it("returns zero counts when changelog has no description changes", async () => {
    seedTicket(testDb, "VPL-100");
    mockGetDescriptionChangelog.mockResolvedValue([]);

    const res = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/import", { method: "POST" }),
      makeParams("VPL-100"),
    );

    const data = await res.json();
    expect(data).toEqual({ imported: 0, skipped: 0, total: 0 });
  });

  it("imports description changes as new versions", async () => {
    seedTicket(testDb, "VPL-100");
    mockGetDescriptionChangelog.mockResolvedValue([
      {
        description: "First version",
        author: "Alice",
        avatar: "https://example.com/alice.png",
        created: "2026-01-15T10:00:00.000+0000",
      },
      {
        description: "Second version",
        author: "Bob",
        avatar: null,
        created: "2026-01-16T12:00:00.000+0000",
      },
    ]);

    const res = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/import", { method: "POST" }),
      makeParams("VPL-100"),
    );

    const data = await res.json();
    expect(data).toEqual({ imported: 2, skipped: 0, total: 2 });

    const versions = testDb.select().from(storyVersion).all();
    expect(versions).toHaveLength(2);
    expect(versions[0].description).toBe("First version");
    expect(versions[0].updatedBy).toBe("Alice");
    expect(versions[0].updatedByAvatar).toBe("https://example.com/alice.png");
    expect(versions[0].createdAt).toBe("2026-01-15T10:00:00.000+0000");
    expect(versions[1].description).toBe("Second version");
    expect(versions[1].updatedBy).toBe("Bob");
    expect(versions[1].updatedByAvatar).toBeNull();
  });

  it("skips versions that already exist by content hash", async () => {
    seedTicket(testDb, "VPL-100");

    // Pre-insert a version with a known content hash
    const { createHash } = await import("crypto");
    const existingHash = createHash("sha256")
      .update(`${JSON.stringify("Existing desc")}|`)
      .digest("hex")
      .slice(0, 16);

    testDb.insert(storyVersion).values({
      id: "sv-existing",
      jiraKey: "VPL-100",
      description: "Existing desc (markdown version)",
      contentHash: existingHash,
    }).run();

    mockGetDescriptionChangelog.mockResolvedValue([
      {
        description: "Existing desc",
        author: "Alice",
        avatar: null,
        created: "2026-01-15T10:00:00.000+0000",
      },
      {
        description: "Brand new desc",
        author: "Bob",
        avatar: null,
        created: "2026-01-16T12:00:00.000+0000",
      },
    ]);

    const res = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/import", { method: "POST" }),
      makeParams("VPL-100"),
    );

    const data = await res.json();
    expect(data).toEqual({ imported: 1, skipped: 1, total: 2 });

    const versions = testDb.select().from(storyVersion).all();
    expect(versions).toHaveLength(2);
  });

  it("deduplicates within the same changelog batch", async () => {
    seedTicket(testDb, "VPL-100");

    mockGetDescriptionChangelog.mockResolvedValue([
      {
        description: "Same desc",
        author: "Alice",
        avatar: null,
        created: "2026-01-15T10:00:00.000+0000",
      },
      {
        description: "Same desc",
        author: "Bob",
        avatar: null,
        created: "2026-01-16T12:00:00.000+0000",
      },
    ]);

    const res = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/import", { method: "POST" }),
      makeParams("VPL-100"),
    );

    const data = await res.json();
    expect(data.imported).toBe(1);
    expect(data.skipped).toBe(1);
  });
});
