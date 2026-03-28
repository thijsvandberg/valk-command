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

import { GET, POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/conversations", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no conversations exist", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns conversations sorted by most recent first", async () => {
    const req1 = jsonRequest({ title: "First conversation" });
    await POST(req1);
    const req2 = jsonRequest({ title: "Second conversation" });
    await POST(req2);

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data[0].title).toBe("Second conversation");
    expect(data[1].title).toBe("First conversation");
  });
});

describe("POST /api/conversations", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a conversation with a title", async () => {
    const response = await POST(jsonRequest({ title: "New chat" }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.title).toBe("New chat");
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.relatedTicket).toBeNull();
  });

  it("creates a conversation with a related ticket", async () => {
    const response = await POST(
      jsonRequest({ title: "Bug fix", relatedTicket: "VALK-42" }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.relatedTicket).toBe("VALK-42");
  });

  it("trims whitespace from title", async () => {
    const response = await POST(jsonRequest({ title: "  spaced  " }));
    const data = await response.json();

    expect(data.title).toBe("spaced");
  });

  it("returns 400 when title is missing", async () => {
    const response = await POST(jsonRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("title is required");
  });

  it("returns 400 when title is empty string", async () => {
    const response = await POST(jsonRequest({ title: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("title is required");
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost:3100/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
