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

import { GET, DELETE } from "./route";
import { POST as createConversation } from "../route";
import { POST as createMessage } from "./messages/route";

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

describe("GET /api/conversations/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns a conversation with its messages", async () => {
    const conversation = await seedConversation();

    await createMessage(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "user",
        content: "Hello",
      }),
      makeParams(conversation.id),
    );

    await createMessage(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "assistant",
        content: "Hi there",
      }),
      makeParams(conversation.id),
    );

    const response = await GET(
      new Request(`http://localhost/api/conversations/${conversation.id}`),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe(conversation.id);
    expect(data.title).toBe("Test chat");
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].role).toBe("user");
    expect(data.messages[1].role).toBe("assistant");
  });

  it("returns conversation with empty messages array when no messages", async () => {
    const conversation = await seedConversation();

    const response = await GET(
      new Request(`http://localhost/api/conversations/${conversation.id}`),
      makeParams(conversation.id),
    );
    const data = await response.json();

    expect(data.messages).toEqual([]);
  });

  it("returns 404 for non-existent conversation", async () => {
    const response = await GET(
      new Request("http://localhost/api/conversations/does-not-exist"),
      makeParams("does-not-exist"),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});

describe("DELETE /api/conversations/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("deletes a conversation and returns 204", async () => {
    const conversation = await seedConversation();

    const response = await DELETE(
      new Request(`http://localhost/api/conversations/${conversation.id}`, {
        method: "DELETE",
      }),
      makeParams(conversation.id),
    );

    expect(response.status).toBe(204);

    const getResponse = await GET(
      new Request(`http://localhost/api/conversations/${conversation.id}`),
      makeParams(conversation.id),
    );
    expect(getResponse.status).toBe(404);
  });

  it("cascade deletes associated messages", async () => {
    const conversation = await seedConversation();

    await createMessage(
      jsonRequest(`http://localhost/api/conversations/${conversation.id}/messages`, {
        role: "user",
        content: "This should be deleted",
      }),
      makeParams(conversation.id),
    );

    await DELETE(
      new Request(`http://localhost/api/conversations/${conversation.id}`, {
        method: "DELETE",
      }),
      makeParams(conversation.id),
    );

    const getResponse = await GET(
      new Request(`http://localhost/api/conversations/${conversation.id}`),
      makeParams(conversation.id),
    );
    expect(getResponse.status).toBe(404);
  });

  it("returns 404 for non-existent conversation", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/conversations/does-not-exist", {
        method: "DELETE",
      }),
      makeParams("does-not-exist"),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("not found");
  });
});
