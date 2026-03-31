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

import { PUT } from "./route";

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

function putRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/metadata`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/tickets/[key]/metadata", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates metadata for a ticket that has none", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await PUT(
      putRequest("VPL-100", { poStatus: "Ready" }),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.poStatus).toBe("Ready");
    expect(data.jiraKey).toBe("VPL-100");
  });

  it("updates existing metadata", async () => {
    seedTicket(testDb, "VPL-100");

    await PUT(
      putRequest("VPL-100", { poStatus: "New" }),
      makeParams("VPL-100"),
    );

    const response = await PUT(
      putRequest("VPL-100", { poStatus: "Ready", qualityScore: 90 }),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(data.poStatus).toBe("Ready");
    expect(data.qualityScore).toBe(90);
  });

  it("updates only provided fields", async () => {
    seedTicket(testDb, "VPL-100");

    await PUT(
      putRequest("VPL-100", { poStatus: "New", qualityScore: 50 }),
      makeParams("VPL-100"),
    );

    const response = await PUT(
      putRequest("VPL-100", { poNotes: "Some note" }),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(data.poStatus).toBe("New");
    expect(data.qualityScore).toBe(50);
    expect(data.poNotes).toBe("Some note");
  });

  it("allows setting poStatus to null", async () => {
    seedTicket(testDb, "VPL-100");

    await PUT(
      putRequest("VPL-100", { poStatus: "Ready" }),
      makeParams("VPL-100"),
    );

    const response = await PUT(
      putRequest("VPL-100", { poStatus: null }),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(data.poStatus).toBeNull();
  });

  it("returns 404 when ticket not found", async () => {
    const response = await PUT(
      putRequest("VPL-999", { poStatus: "Ready" }),
      makeParams("VPL-999"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid poStatus", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await PUT(
      putRequest("VPL-100", { poStatus: "InvalidStatus" }),
      makeParams("VPL-100"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid qualityScore", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await PUT(
      putRequest("VPL-100", { qualityScore: 150 }),
      makeParams("VPL-100"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    seedTicket(testDb, "VPL-100");

    const request = new Request("http://localhost:3100/api/tickets/VPL-100/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await PUT(request, makeParams("VPL-100"));

    expect(response.status).toBe(400);
  });

  it("handles qualityStale flag", async () => {
    seedTicket(testDb, "VPL-100");

    const response = await PUT(
      putRequest("VPL-100", { qualityScore: 80, qualityStale: true }),
      makeParams("VPL-100"),
    );
    const data = await response.json();

    expect(data.qualityScore).toBe(80);
    expect(data.qualityStale).toBe(true);
  });
});
