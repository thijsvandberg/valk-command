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

import { GET } from "./route";

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

  it("returns only metadata when metaOnly=true", async () => {
    seedTicket(testDb, "VPL-100");

    testDb
      .insert(storyVersion)
      .values({
        id: "sv-1",
        jiraKey: "VPL-100",
        description: "Some long description",
        acceptanceCriteria: "Some AC",
        contentHash: "abc123",
      })
      .run();

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions?metaOnly=true"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("sv-1");
    expect(data[0].contentHash).toBe("abc123");
    expect(data[0]).not.toHaveProperty("description");
    expect(data[0]).not.toHaveProperty("acceptanceCriteria");
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

