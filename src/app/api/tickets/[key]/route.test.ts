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

describe("GET /api/tickets/[key]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns ticket when found", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jiraKey).toBe("VPL-100");
    expect(data.title).toBe("Ticket VPL-100");
  });

  it("returns 404 when ticket not found", async () => {
    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-999"),
      makeParams("VPL-999"),
    );

    expect(response.status).toBe(404);
  });

  it("includes metadata when available", async () => {
    seedTicket(testDb, "VPL-100");

    const { ticketMetadata } = await import("@/db/schema");
    testDb
      .insert(ticketMetadata)
      .values({
        jiraKey: "VPL-100",
        poStatus: "Uitwerken",
        qualityScore: 60,
      })
      .run();

    const response = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-100"),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(data.metadata).not.toBeNull();
    expect(data.metadata.poStatus).toBe("Uitwerken");
  });
});
