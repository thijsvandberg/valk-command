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
  db.insert(ticket).values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO" }).run();
}

function makeParams(key: string, id: string): { params: Promise<{ key: string; id: string }> } {
  return { params: Promise.resolve({ key, id }) };
}

describe("GET /api/tickets/[key]/versions/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns the version with full content", async () => {
    seedTicket(testDb, "VPL-100");
    testDb.insert(storyVersion).values({
      id: "sv-1",
      jiraKey: "VPL-100",
      description: "Full description text",
      acceptanceCriteria: "AC text",
      contentHash: "abc123",
    }).run();

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/sv-1"),
      makeParams("VPL-100", "sv-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("sv-1");
    expect(data.description).toBe("Full description text");
    expect(data.acceptanceCriteria).toBe("AC text");
  });

  it("returns 404 when version does not exist", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/missing"),
      makeParams("VPL-100", "missing"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 when version belongs to a different ticket", async () => {
    seedTicket(testDb, "VPL-100");
    seedTicket(testDb, "VPL-200");
    testDb.insert(storyVersion).values({
      id: "sv-1",
      jiraKey: "VPL-200",
      description: "Other ticket",
      contentHash: "xyz",
    }).run();

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/sv-1"),
      makeParams("VPL-100", "sv-1"),
    );

    expect(response.status).toBe(404);
  });
});
