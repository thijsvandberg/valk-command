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
import { POST } from "./route";

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

  dbRef.current
    .insert(schema.conversation)
    .values({ id: "c1", title: "Test conv", createdAt: "2026-03-28T00:00:00Z" })
    .run();
});

function makeRequest(conversationId: string, body: unknown) {
  return {
    request: new Request(
      `http://localhost/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    context: { params: Promise.resolve({ id: conversationId }) },
  };
}

describe("POST /api/conversations/[id]/messages", () => {
  it("creates a user message", async () => {
    const { request, context } = makeRequest("c1", {
      role: "user",
      content: "Hello world",
    });

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.role).toBe("user");
    expect(data.content).toBe("Hello world");
    expect(data.conversationId).toBe("c1");
    expect(data.id).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(data.workspaceTaskId).toBeNull();
  });

  it("creates an assistant message", async () => {
    const { request, context } = makeRequest("c1", {
      role: "assistant",
      content: "I can help with that",
    });

    const response = await POST(request, context);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.role).toBe("assistant");
  });

  it("accepts optional workspaceTaskId", async () => {
    const { request, context } = makeRequest("c1", {
      role: "assistant",
      content: "Task result",
      workspaceTaskId: "wt-123",
    });

    const response = await POST(request, context);
    const data = await response.json();

    expect(data.workspaceTaskId).toBe("wt-123");
  });

  it("trims whitespace from content", async () => {
    const { request, context } = makeRequest("c1", {
      role: "user",
      content: "  padded  ",
    });

    const response = await POST(request, context);
    const data = await response.json();

    expect(data.content).toBe("padded");
  });

  it("persists the message to the database", async () => {
    const { request, context } = makeRequest("c1", {
      role: "user",
      content: "Stored",
    });

    await POST(request, context);

    const rows = dbRef.current.select().from(schema.message).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("Stored");
  });

  it("returns 404 for non-existent conversation", async () => {
    const { request, context } = makeRequest("nope", {
      role: "user",
      content: "Hello",
    });

    const response = await POST(request, context);
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Conversation not found");
  });

  it("returns 400 when content is missing", async () => {
    const { request, context } = makeRequest("c1", {
      role: "user",
    });

    const response = await POST(request, context);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("content is required");
  });

  it("returns 400 when role is missing", async () => {
    const { request, context } = makeRequest("c1", {
      content: "Hello",
    });

    const response = await POST(request, context);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("role must be 'user' or 'assistant'");
  });

  it("returns 400 when role is invalid", async () => {
    const { request, context } = makeRequest("c1", {
      role: "system",
      content: "Hello",
    });

    const response = await POST(request, context);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("role must be 'user' or 'assistant'");
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request(
      "http://localhost/api/conversations/c1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid JSON");
  });
});
