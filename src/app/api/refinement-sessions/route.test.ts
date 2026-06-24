// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { buildJson } from "@/test/request-helpers";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return buildJson("POST", "/api/refinement-sessions", body);
}

describe("GET /api/refinement-sessions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no sessions exist", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns all sessions with parsed ticketKeys", async () => {
    await POST(jsonRequest({ name: "Sprint 42", ticketKeys: ["VPL-1", "VPL-2"] }));
    await POST(jsonRequest({ name: "Sprint 43" }));

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data[0].ticketKeys).toBeInstanceOf(Array);
    expect(data[0].ticketCount).toBeDefined();
  });

  it("promotes finalized DRAFT keys to their real ticket and dedups, so the count matches the visible queue", async () => {
    // A draft promoted to a brand-new real ticket (would otherwise be a ghost)...
    testDb.insert(ticket).values({ jiraKey: "VPL-885", title: "Hotel logout", type: "story", status: "TO DO" }).run();
    testDb.insert(ticket).values({ jiraKey: "DRAFT-new", title: "404 logout", type: "story", status: "REPLACED", description: "VPL-885" }).run();
    // ...and a draft promoted to a ticket already in the session (duplicate, over-counts).
    testDb.insert(ticket).values({ jiraKey: "VPL-890", title: "Forgot password", type: "story", status: "TO DO" }).run();
    testDb.insert(ticket).values({ jiraKey: "DRAFT-dup", title: "Untitled draft", type: "story", status: "REPLACED", description: "VPL-890" }).run();

    await POST(jsonRequest({
      name: "24 Jun",
      ticketKeys: ["VPL-869", "DRAFT-new", "DRAFT-dup", "VPL-890"],
    }));

    const response = await GET();
    const data = await response.json();

    expect(data[0].ticketKeys).toEqual(["VPL-869", "VPL-885", "VPL-890"]);
    expect(data[0].ticketCount).toBe(3);
  });
});

describe("POST /api/refinement-sessions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 400 when neither name nor date is provided", async () => {
    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(400);
  });

  it("creates a session with name only", async () => {
    const response = await POST(jsonRequest({ name: "Sprint 42" }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Sprint 42");
    expect(data.scheduledFor).toBeNull();
    expect(data.status).toBe("draft");
    expect(data.ticketKeys).toEqual([]);
    expect(data.ticketCount).toBe(0);
    expect(data.id).toBeDefined();
  });

  it("creates a session with date only and round-trips it through GET", async () => {
    const response = await POST(jsonRequest({ scheduledFor: "2030-06-18" }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBeNull();
    expect(data.scheduledFor).toBe("2030-06-18");

    const listResponse = await GET();
    const list = await listResponse.json();
    expect(list[0].scheduledFor).toBe("2030-06-18");
  });

  it("creates a session with both name and date", async () => {
    const response = await POST(
      jsonRequest({ name: "Sprint 42", scheduledFor: "2030-06-18" }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Sprint 42");
    expect(data.scheduledFor).toBe("2030-06-18");
  });

  it("rejects a malformed scheduledFor", async () => {
    const response = await POST(
      jsonRequest({ name: "Sprint 42", scheduledFor: "18-06-2030" }),
    );

    expect(response.status).toBe(400);
  });

  it("creates a session with provided name and tickets", async () => {
    const response = await POST(
      jsonRequest({ name: "Sprint 42 refinement", ticketKeys: ["VPL-1", "VPL-2"] }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBe("Sprint 42 refinement");
    expect(data.ticketKeys).toEqual(["VPL-1", "VPL-2"]);
    expect(data.ticketCount).toBe(2);
  });

  it("filters out non-string ticketKeys", async () => {
    const response = await POST(
      jsonRequest({ name: "S", ticketKeys: ["VPL-1", "", null, 42, "VPL-2"] }),
    );
    const data = await response.json();

    expect(data.ticketKeys).toEqual(["VPL-1", "VPL-2"]);
    expect(data.ticketCount).toBe(2);
  });

  it("trims whitespace from name", async () => {
    const response = await POST(jsonRequest({ name: "  trimmed  " }));
    const data = await response.json();

    expect(data.name).toBe("trimmed");
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost:3100/api/refinement-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("ignores non-string values in ticketKeys array", async () => {
    const response = await POST(
      jsonRequest({ name: "S", ticketKeys: [null, 42, false, undefined] }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.ticketKeys).toEqual([]);
    expect(data.ticketCount).toBe(0);
  });

  it("stores a null name when only a date is given with an empty name", async () => {
    const response = await POST(jsonRequest({ name: "   ", scheduledFor: "2030-06-18" }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toBeNull();
    expect(data.scheduledFor).toBe("2030-06-18");
  });

  it("returns 400 when name is whitespace only and no date is given", async () => {
    const response = await POST(jsonRequest({ name: "   " }));

    expect(response.status).toBe(400);
  });
});
