// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "path";
import * as schema from "@/db/schema";

const MIGRATIONS = resolve(process.cwd(), "drizzle");

function setup() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, sqlite };
}

// Intercept the db module so the route uses our in-memory database
let testDb: ReturnType<typeof setup>["db"];

import { vi } from "vitest";
vi.mock("@/db", () => ({ get db() { return testDb; } }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: () => null }));

import { PATCH } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/conversations/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function insertConversation(id: string, readAt: string | null = null) {
  await testDb.insert(schema.conversation).values({
    id,
    title: `Conv ${id}`,
    type: "chat",
    createdAt: new Date().toISOString(),
    readAt,
  });
}

describe("PATCH /api/conversations/bulk", () => {
  beforeEach(() => {
    const { db } = setup();
    testDb = db;
  });

  it("rejects invalid JSON", async () => {
    const req = new Request("http://localhost", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("rejects empty ids array", async () => {
    const res = await PATCH(makeRequest({ ids: [], action: "markRead" }));
    expect(res.status).toBe(400);
  });

  it("rejects invalid action", async () => {
    const res = await PATCH(makeRequest({ ids: ["a"], action: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("marks conversations as read", async () => {
    await insertConversation("c1");
    await insertConversation("c2");
    const res = await PATCH(makeRequest({ ids: ["c1", "c2"], action: "markRead" }));
    expect(res.status).toBe(200);

    const c1 = await testDb.query.conversation.findFirst({
      where: (c, { eq }) => eq(c.id, "c1"),
    });
    expect(c1?.readAt).not.toBeNull();
  });

  it("marks conversations as unread", async () => {
    await insertConversation("c1", new Date().toISOString());
    const res = await PATCH(makeRequest({ ids: ["c1"], action: "markUnread" }));
    expect(res.status).toBe(200);

    const c1 = await testDb.query.conversation.findFirst({
      where: (c, { eq }) => eq(c.id, "c1"),
    });
    expect(c1?.readAt).toBeNull();
  });

  it("deletes selected conversations", async () => {
    await insertConversation("c1");
    await insertConversation("c2");
    await insertConversation("c3");
    const res = await PATCH(makeRequest({ ids: ["c1", "c2"], action: "delete" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);

    const remaining = await testDb.select().from(schema.conversation);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("c3");
  });
});
