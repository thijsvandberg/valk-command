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

function seedConversation() {
  testDb
    .insert(schema.conversation)
    .values({ id: "c1", title: "Test chat", createdAt: "2026-03-28T00:00:00Z" })
    .run();

  testDb
    .insert(schema.message)
    .values([
      {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "Hello",
        timestamp: "2026-03-28T10:00:00Z",
      },
      {
        id: "m2",
        conversationId: "c1",
        role: "assistant",
        content: "Hi there",
        timestamp: "2026-03-28T10:01:00Z",
      },
    ])
    .run();
}

describe("GET /api/conversations/[id]", () => {
  it("returns conversation with messages", async () => {
    seedConversation();
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("c1");
    expect(data.title).toBe("Test chat");
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].id).toBe("m1");
    expect(data.messages[1].id).toBe("m2");
  });

  it("returns messages in chronological order", async () => {
    seedConversation();
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await response.json();

    expect(data.messages[0].timestamp).toBe("2026-03-28T10:00:00Z");
    expect(data.messages[1].timestamp).toBe("2026-03-28T10:01:00Z");
  });

  it("returns 404 for non-existent conversation", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain("not found");
  });

  it("returns empty messages array for conversation with no messages", async () => {
    testDb
      .insert(schema.conversation)
      .values({ id: "c1", title: "Empty chat", createdAt: "2026-03-28T00:00:00Z" })
      .run();

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const data = await response.json();

    expect(data.messages).toEqual([]);
  });
});

describe("DELETE /api/conversations/[id]", () => {
  it("deletes conversation and its messages", async () => {
    seedConversation();
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" }),
    });

    expect(response.status).toBe(204);

    const convRows = testDb.select().from(schema.conversation).all();
    expect(convRows).toHaveLength(0);

    const msgRows = testDb.select().from(schema.message).all();
    expect(msgRows).toHaveLength(0);
  });

  it("returns 404 for non-existent conversation", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(response.status).toBe(404);
  });

  it("does not delete messages from other conversations", async () => {
    seedConversation();

    testDb
      .insert(schema.conversation)
      .values({ id: "c2", title: "Other", createdAt: "2026-03-28T00:00:00Z" })
      .run();
    testDb
      .insert(schema.message)
      .values({
        id: "m3",
        conversationId: "c2",
        role: "user",
        content: "Other msg",
        timestamp: "2026-03-28T10:00:00Z",
      })
      .run();

    const { DELETE } = await import("./route");
    await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" }),
    });

    const remaining = testDb.select().from(schema.message).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].conversationId).toBe("c2");
  });
});
