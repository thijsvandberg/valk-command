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

import { GET, POST } from "./route";

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

describe("GET /api/tickets/[key]/versions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no versions exist", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns versions when they exist", async () => {
    seedTicket(testDb, "VPL-100");

    testDb
      .insert(storyVersion)
      .values({
        id: "sv-1",
        jiraKey: "VPL-100",
        description: "Initial description",
        contentHash: "abc123",
      })
      .run();

    testDb
      .insert(storyVersion)
      .values({
        id: "sv-2",
        jiraKey: "VPL-100",
        description: "Updated description",
        acceptanceCriteria: "Some AC",
        contentHash: "def456",
      })
      .run();

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].jiraKey).toBe("VPL-100");
    expect(data[1].description).toBe("Updated description");
  });

  it("does not return versions from other tickets", async () => {
    seedTicket(testDb, "VPL-100");
    seedTicket(testDb, "VPL-200");

    testDb
      .insert(storyVersion)
      .values({
        id: "sv-1",
        jiraKey: "VPL-100",
        description: "VPL-100 description",
        contentHash: "abc",
      })
      .run();

    testDb
      .insert(storyVersion)
      .values({
        id: "sv-2",
        jiraKey: "VPL-200",
        description: "VPL-200 description",
        contentHash: "def",
      })
      .run();

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].jiraKey).toBe("VPL-100");
  });
});

describe("POST /api/tickets/[key]/versions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a new version snapshot", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Snapshot content" }),
      }),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.jiraKey).toBe("VPL-100");
    expect(data.description).toBe("Snapshot content");
    expect(data.contentHash).toBeTruthy();
  });

  it("creates a version with a tag", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Pre-refinement snapshot",
          tag: "pre-refinement",
        }),
      }),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.tag).toBe("pre-refinement");
  });

  it("rejects invalid tags", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Content",
          tag: "bad-tag",
        }),
      }),
      makeParams("VPL-100"),
    );

    expect(response.status).toBe(400);
  });

  it("rejects missing description", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await POST(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeParams("VPL-100"),
    );

    expect(response.status).toBe(400);
  });
});
