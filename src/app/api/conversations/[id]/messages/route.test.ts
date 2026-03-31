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

import { POST } from "./route";
import { POST as createConversation } from "../../route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedConversation(title = "Test chat") {
  const response = await createConversation(
    jsonRequest("http://localhost/api/conversations", { title }),
  );
  return response.json();
}

describe("POST /api/conversations/[id]/messages", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates a user message", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "user",
        content: "Hello, world!",
      }),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.role).toBe("user");
    expect(data.content).toBe("Hello, world!");
    expect(data.conversationId).toBe(conversation.id);
    expect(data.id).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(data.workspaceTaskId).toBeNull();
  });

  it("creates an assistant message", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "assistant",
        content: "I can help with that.",
      }),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.role).toBe("assistant");
  });

  it("creates a message with workspaceTaskId", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "assistant",
        content: "Task result",
        workspaceTaskId: "task-123",
      }),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(data.workspaceTaskId).toBe("task-123");
  });

  it("trims whitespace from content", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "user",
        content: "  spaced  ",
      }),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(data.content).toBe("spaced");
  });

  it("returns 404 for non-existent conversation", async () => {
    const response = await POST(
      jsonRequest("http://localhost/api/conversations/does-not-exist/messages", {
        role: "user",
        content: "Hello",
      }),
      makeParams("does-not-exist"),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });

  it("returns 400 when content is missing", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "user",
      }),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("content is required");
  });

  it("returns 400 when content is empty", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "user",
        content: "",
      }),
      makeParams(conversation.id),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when role is missing", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        content: "Hello",
      }),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("role is required");
  });

  it("returns 400 when role is invalid", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "system",
        content: "Hello",
      }),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("role is required");
  });

  it("returns 400 for invalid JSON body", async () => {
    const conversation = await seedConversation();

    const response = await POST(
      new Request(
        `http://localhost/api/conversations/${conversation.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        },
      ),
      makeParams(conversation.id),
    );

    expect(response.status).toBe(400);
  });
});
