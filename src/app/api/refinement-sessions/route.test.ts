// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { buildJson } from "@/test/request-helpers";

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
});

describe("POST /api/refinement-sessions", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a session with default name when none provided", async () => {
    const response = await POST(jsonRequest({}));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.name).toMatch(/^Refinement \d{4}-\d{2}-\d{2}$/);
    expect(data.status).toBe("draft");
    expect(data.ticketKeys).toEqual([]);
    expect(data.ticketCount).toBe(0);
    expect(data.id).toBeDefined();
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
      jsonRequest({ ticketKeys: ["VPL-1", "", null, 42, "VPL-2"] }),
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
});
