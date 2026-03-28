// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/db/schema";
import { vi } from "vitest";

let sqlite: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

beforeAll(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  sqlite.close();
});

beforeEach(() => {
  sqlite.exec("DELETE FROM message");
  sqlite.exec("DELETE FROM conversation");
});

describe("GET /api/conversations", () => {
  it("returns empty array when no conversations exist", async () => {
    const { GET } = await import("./route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("returns conversations sorted by most recent message", async () => {
    testDb
      .insert(schema.conversation)
      .values([
        { id: "c1", title: "Older", createdAt: "2026-03-27T00:00:00Z" },
        { id: "c2", title: "Newer", createdAt: "2026-03-28T00:00:00Z" },
      ])
      .run();

    testDb
      .insert(schema.message)
      .values([
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "Hello",
          timestamp: "2026-03-27T12:00:00Z",
        },
        {
          id: "m2",
          conversationId: "c2",
          role: "user",
          content: "Hi",
          timestamp: "2026-03-28T12:00:00Z",
        },
      ])
      .run();

    const { GET } = await import("./route");
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("c2");
    expect(data[0].title).toBe("Newer");
    expect(data[0].lastMessageAt).toBe("2026-03-28T12:00:00Z");
    expect(data[1].id).toBe("c1");
  });

  it("uses createdAt as fallback when no messages exist", async () => {
    testDb
      .insert(schema.conversation)
      .values({ id: "c1", title: "Empty", createdAt: "2026-03-28T10:00:00Z" })
      .run();

    const { GET } = await import("./route");
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].lastMessageAt).toBe("2026-03-28T10:00:00Z");
  });
});

describe("POST /api/conversations", () => {
  it("creates a new conversation", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.title).toBe("New chat");
    expect(data.id).toBeDefined();
    expect(data.lastMessageAt).toBeDefined();
  });

  it("trims whitespace from title", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "  Padded title  " }),
      }),
    );
    const data = await response.json();

    expect(data.title).toBe("Padded title");
  });

  it("rejects empty title", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("title");
  });

  it("rejects missing title", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid JSON");
  });
});
