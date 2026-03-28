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
import { GET, DELETE } from "./route";

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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/conversations/[id]", () => {
  it("returns conversation with its messages", async () => {
    dbRef.current
      .insert(schema.conversation)
      .values({ id: "c1", title: "Test", createdAt: "2026-03-28T00:00:00Z" })
      .run();

    dbRef.current
      .insert(schema.message)
      .values([
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "Hello",
          timestamp: "2026-03-28T00:00:01Z",
        },
        {
          id: "m2",
          conversationId: "c1",
          role: "assistant",
          content: "Hi there",
          timestamp: "2026-03-28T00:00:02Z",
        },
      ])
      .run();

    const response = await GET(
      new Request("http://localhost/api/conversations/c1"),
      makeParams("c1")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("c1");
    expect(data.title).toBe("Test");
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].id).toBe("m1");
    expect(data.messages[1].id).toBe("m2");
  });

  it("returns messages ordered by timestamp", async () => {
    dbRef.current
      .insert(schema.conversation)
      .values({ id: "c1", title: "Test", createdAt: "2026-03-28T00:00:00Z" })
      .run();

    dbRef.current
      .insert(schema.message)
      .values([
        {
          id: "m-late",
          conversationId: "c1",
          role: "assistant",
          content: "Second",
          timestamp: "2026-03-28T00:00:10Z",
        },
        {
          id: "m-early",
          conversationId: "c1",
          role: "user",
          content: "First",
          timestamp: "2026-03-28T00:00:01Z",
        },
      ])
      .run();

    const response = await GET(
      new Request("http://localhost/api/conversations/c1"),
      makeParams("c1")
    );
    const data = await response.json();

    expect(data.messages[0].id).toBe("m-early");
    expect(data.messages[1].id).toBe("m-late");
  });

  it("returns empty messages array when conversation has no messages", async () => {
    dbRef.current
      .insert(schema.conversation)
      .values({ id: "c1", title: "Empty", createdAt: "2026-03-28T00:00:00Z" })
      .run();

    const response = await GET(
      new Request("http://localhost/api/conversations/c1"),
      makeParams("c1")
    );
    const data = await response.json();

    expect(data.messages).toEqual([]);
  });

  it("returns 404 for non-existent conversation", async () => {
    const response = await GET(
      new Request("http://localhost/api/conversations/nope"),
      makeParams("nope")
    );

    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Conversation not found");
  });
});

describe("DELETE /api/conversations/[id]", () => {
  it("deletes a conversation and its messages", async () => {
    dbRef.current
      .insert(schema.conversation)
      .values({ id: "c1", title: "Doomed", createdAt: "2026-03-28T00:00:00Z" })
      .run();

    dbRef.current
      .insert(schema.message)
      .values({
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "Goodbye",
        timestamp: "2026-03-28T00:00:01Z",
      })
      .run();

    const response = await DELETE(
      new Request("http://localhost/api/conversations/c1", { method: "DELETE" }),
      makeParams("c1")
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    const convRows = dbRef.current.select().from(schema.conversation).all();
    expect(convRows).toHaveLength(0);

    const msgRows = dbRef.current.select().from(schema.message).all();
    expect(msgRows).toHaveLength(0);
  });

  it("does not delete other conversations", async () => {
    dbRef.current
      .insert(schema.conversation)
      .values([
        { id: "c1", title: "Delete me", createdAt: "2026-03-28T00:00:00Z" },
        { id: "c2", title: "Keep me", createdAt: "2026-03-28T00:00:00Z" },
      ])
      .run();

    await DELETE(
      new Request("http://localhost/api/conversations/c1", { method: "DELETE" }),
      makeParams("c1")
    );

    const rows = dbRef.current.select().from(schema.conversation).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c2");
  });

  it("returns 404 for non-existent conversation", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/conversations/nope", { method: "DELETE" }),
      makeParams("nope")
    );

    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Conversation not found");
  });
});
