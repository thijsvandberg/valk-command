// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, appSetting } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "./route";

function seedTicket(
  db: BetterSQLite3Database<typeof schema>,
  key: string,
  assignee?: string,
) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
      assignee: assignee ?? null,
    })
    .run();
}

describe("GET /api/search/local/filter-options", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty arrays when no data", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.assignees).toEqual([]);
    expect(data.sprints).toEqual([]);
    expect(data.poStatuses).toEqual([]);
  });

  it("returns assignees sorted alphabetically", async () => {
    seedTicket(testDb, "BRDG-1", "Charlie");
    seedTicket(testDb, "BRDG-2", "Alice");
    seedTicket(testDb, "BRDG-3", "Bob");

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.assignees).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("returns sprints from appSetting JSON", async () => {
    const sprints = [
      { id: 10, name: "Sprint 10" },
      { id: 20, name: "Sprint 20" },
    ];
    testDb
      .insert(appSetting)
      .values({ key: "jira_sprints", value: JSON.stringify(sprints) })
      .run();

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sprints).toHaveLength(2);
    // Sorted by id descending
    expect(data.sprints[0].id).toBe("20");
    expect(data.sprints[0].name).toBe("Sprint 20");
    expect(data.sprints[1].id).toBe("10");
    expect(data.sprints[1].name).toBe("Sprint 10");
  });

  it("returns distinct poStatuses", async () => {
    seedTicket(testDb, "BRDG-1");
    seedTicket(testDb, "BRDG-2");

    testDb
      .insert(ticketMetadata)
      .values({ jiraKey: "BRDG-1", poStatus: "Draft" })
      .run();
    testDb
      .insert(ticketMetadata)
      .values({ jiraKey: "BRDG-2", poStatus: "Ready" })
      .run();

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.poStatuses).toEqual(["Draft", "Ready"]);
  });

  it("excludes null and empty assignees", async () => {
    seedTicket(testDb, "BRDG-1", "Alice");
    seedTicket(testDb, "BRDG-2", "");
    seedTicket(testDb, "BRDG-3");

    const response = await GET();
    const data = await response.json();

    expect(data.assignees).toEqual(["Alice"]);
  });
});
