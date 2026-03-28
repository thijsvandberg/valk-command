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

  testDb
    .insert(schema.conversation)
    .values({ id: "c1", title: "Test chat", createdAt: "2026-03-28T00:00:00Z" })
    .run();
});

function makeRequest(conversationId: string, body: unknown) {
  return new Request(
    `http://localhost/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/conversations/[id]/messages", () => {
  it("creates a user message", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { role: "user", content: "Hello" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.conversationId).toBe("c1");
    expect(data.role).toBe("user");
    expect(data.content).toBe("Hello");
    expect(data.timestamp).toBeDefined();
  });

  it("creates an assistant message", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { role: "assistant", content: "Hi there" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.role).toBe("assistant");
  });

  it("trims whitespace from content", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { role: "user", content: "  spaced  " }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const data = await response.json();

    expect(data.content).toBe("spaced");
  });

  it("persists message in database", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { role: "user", content: "Stored" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const data = await response.json();

    const rows = testDb.select().from(schema.message).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(data.id);
    expect(rows[0].content).toBe("Stored");
  });

  it("returns 404 for non-existent conversation", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("nonexistent", { role: "user", content: "Hello" }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );

    expect(response.status).toBe(404);
  });

  it("rejects invalid role", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { role: "system", content: "Hello" }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("role");
  });

  it("rejects missing role", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { content: "Hello" }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("rejects empty content", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { role: "user", content: "" }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("content");
  });

  it("rejects missing content", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      makeRequest("c1", { role: "user" }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/conversations/c1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid JSON");
  });
});
