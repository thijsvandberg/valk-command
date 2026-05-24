// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { POST } from "../route";
import { GET, PATCH, DELETE } from "./route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createSession(overrides?: object) {
  const req = new Request("http://localhost:3100/api/refinement-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test session", ticketKeys: ["VPL-1"], ...overrides }),
  });
  const res = await POST(req);
  return res.json();
}

describe("GET /api/refinement-sessions/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns the session with parsed ticketKeys", async () => {
    const created = await createSession();
    const response = await GET(new Request("http://localhost"), makeParams(created.id));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Test session");
    expect(data.ticketKeys).toEqual(["VPL-1"]);
    expect(data.ticketCount).toBe(1);
  });

  it("returns 404 for unknown id", async () => {
    const response = await GET(new Request("http://localhost"), makeParams("nonexistent"));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});

describe("PATCH /api/refinement-sessions/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("updates name", async () => {
    const created = await createSession();
    const response = await PATCH(
      jsonRequest("PATCH", { name: "Updated name" }),
      makeParams(created.id),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.name).toBe("Updated name");
  });

  it("updates ticketKeys", async () => {
    const created = await createSession();
    const response = await PATCH(
      jsonRequest("PATCH", { ticketKeys: ["VPL-2", "VPL-3"] }),
      makeParams(created.id),
    );
    const data = await response.json();

    expect(data.ticketKeys).toEqual(["VPL-2", "VPL-3"]);
    expect(data.ticketCount).toBe(2);
  });

  it("updates status to completed", async () => {
    const created = await createSession();
    const response = await PATCH(
      jsonRequest("PATCH", { status: "completed" }),
      makeParams(created.id),
    );
    const data = await response.json();

    expect(data.status).toBe("completed");
  });

  it("updates updatedAt timestamp", async () => {
    const created = await createSession();
    const response = await PATCH(
      jsonRequest("PATCH", { name: "new" }),
      makeParams(created.id),
    );
    const data = await response.json();

    expect(data.updatedAt).not.toBe(created.updatedAt);
  });

  it("returns 404 for unknown id", async () => {
    const response = await PATCH(
      jsonRequest("PATCH", { name: "x" }),
      makeParams("nonexistent"),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 when name is empty string", async () => {
    const created = await createSession();
    const response = await PATCH(
      jsonRequest("PATCH", { name: "" }),
      makeParams(created.id),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when status is invalid", async () => {
    const created = await createSession();
    const response = await PATCH(
      jsonRequest("PATCH", { status: "invalid" }),
      makeParams(created.id),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when ticketKeys is not an array", async () => {
    const created = await createSession();
    const response = await PATCH(
      jsonRequest("PATCH", { ticketKeys: "not-an-array" }),
      makeParams(created.id),
    );

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/refinement-sessions/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes the session and returns 204", async () => {
    const created = await createSession();
    const response = await DELETE(new Request("http://localhost"), makeParams(created.id));

    expect(response.status).toBe(204);

    const getResponse = await GET(new Request("http://localhost"), makeParams(created.id));
    expect(getResponse.status).toBe(404);
  });

  it("returns 404 for unknown id", async () => {
    const response = await DELETE(new Request("http://localhost"), makeParams("nonexistent"));

    expect(response.status).toBe(404);
  });
});
