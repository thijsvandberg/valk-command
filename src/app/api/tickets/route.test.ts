import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

function seedTicket(
  db: BetterSQLite3Database<typeof schema>,
  key: string,
  sprintName: string | null = null,
) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
      sprintName,
    })
    .run();
}

describe("GET /api/tickets", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no tickets exist", async () => {
    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns all tickets when no sprintId filter", async () => {
    seedTicket(testDb, "VPL-100", "Sprint 1");
    seedTicket(testDb, "VPL-101", "Sprint 2");

    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    expect(data).toHaveLength(2);
  });

  it("filters tickets by sprintId", async () => {
    seedTicket(testDb, "VPL-100", "Sprint 1");
    seedTicket(testDb, "VPL-101", "Sprint 2");
    seedTicket(testDb, "VPL-102", "Sprint 1");

    const request = new Request("http://localhost:3100/api/tickets?sprintId=Sprint%201");
    const response = await GET(request);
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data.every((t: { sprintName: string }) => t.sprintName === "Sprint 1")).toBe(true);
  });

  it("includes metadata when available", async () => {
    seedTicket(testDb, "VPL-100");

    // Insert metadata directly
    const { ticketMetadata } = await import("@/db/schema");
    testDb
      .insert(ticketMetadata)
      .values({
        jiraKey: "VPL-100",
        poStatus: "Ready",
        qualityScore: 85,
      })
      .run();

    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    expect(data[0].metadata).not.toBeNull();
    expect(data[0].metadata.poStatus).toBe("Ready");
    expect(data[0].metadata.qualityScore).toBe(85);
  });

  it("returns null metadata when none exists", async () => {
    seedTicket(testDb, "VPL-100");

    const request = new Request("http://localhost:3100/api/tickets");
    const response = await GET(request);
    const data = await response.json();

    expect(data[0].metadata).toBeNull();
  });
});
