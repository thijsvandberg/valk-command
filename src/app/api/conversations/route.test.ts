// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const dbRef = vi.hoisted(() => ({ current: null as any, sqlite: null as any }));

vi.mock("@/db", () => ({
  get db() {
    return dbRef.current;
  },
}));

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { GET, POST } from "./route";

beforeAll(() => {
  dbRef.sqlite = new Database(":memory:");
  dbRef.current = drizzle(dbRef.sqlite, { schema });
  migrate(dbRef.current, { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  dbRef.sqlite?.close();
});

beforeEach(() => {
  dbRef.current.delete(schema.message).run();
  dbRef.current.delete(schema.conversation).run();
});

describe("GET /api/conversations", () => {
  it("returns empty array when no conversations exist", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns conversations sorted by most recent activity", async () => {
    dbRef.current
      .insert(schema.conversation)
      .values([
        { id: "old", title: "Old chat", createdAt: "2026-03-01T00:00:00Z" },
        { id: "new", title: "New chat", createdAt: "2026-03-02T00:00:00Z" },
      ])
      .run();

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("new");
    expect(data[1].id).toBe("old");
  });

  it("sorts by latest message timestamp when messages exist", async () => {
    dbRef.current
      .insert(schema.conversation)
      .values([
        { id: "c1", title: "First", createdAt: "2026-03-01T00:00:00Z" },
        { id: "c2", title: "Second", createdAt: "2026-03-02T00:00:00Z" },
      ])
      .run();

    dbRef.current
      .insert(schema.message)
      .values({
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "Hello",
        timestamp: "2026-03-10T00:00:00Z",
      })
      .run();

    const response = await GET();
    const data = await response.json();

    expect(data[0].id).toBe("c1");
    expect(data[0].lastMessageAt).toBe("2026-03-10T00:00:00Z");
    expect(data[1].id).toBe("c2");
    expect(data[1].lastMessageAt).toBeNull();
  });
});

describe("POST /api/conversations", () => {
  it("creates a conversation with valid title", async () => {
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New conversation" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.title).toBe("New conversation");
    expect(data.id).toBeDefined();
    expect(data.createdAt).toBeDefined();
    expect(data.relatedTicket).toBeNull();
  });

  it("creates a conversation with relatedTicket", async () => {
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Ticket chat", relatedTicket: "VALK-100" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.relatedTicket).toBe("VALK-100");
  });

  it("returns 400 when title is missing", async () => {
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("title is required");
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid JSON");
  });

  it("trims whitespace from title", async () => {
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "  padded title  " }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.title).toBe("padded title");
  });

  it("persists the conversation to the database", async () => {
    const request = new Request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Persisted" }),
    });

    const response = await POST(request);
    const data = await response.json();

    const rows = dbRef.current
      .select()
      .from(schema.conversation)
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(data.id);
  });
});
