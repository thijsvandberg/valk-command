import { describe, it, expect, afterAll } from "vitest";
import { createTestDb, closeAllTestDbs } from "./test-utils";
import { conversation, message } from "./schema";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";

afterAll(() => closeAllTestDbs());

function insertConversation(db: ReturnType<typeof createTestDb>, id: string) {
  db.insert(conversation).values({
    id,
    title: "Test",
    type: "chat",
    createdAt: new Date().toISOString(),
  }).run();
}

function insertMessage(
  db: ReturnType<typeof createTestDb>,
  convId: string,
  seq: number,
  timestamp?: string,
) {
  db.insert(message).values({
    id: randomUUID(),
    conversationId: convId,
    role: "user",
    content: `Message ${seq}`,
    timestamp: timestamp ?? new Date().toISOString(),
    sequence: seq,
  }).run();
}

describe("nextSequence logic", () => {
  it("returns 1 for a conversation with no messages", () => {
    const db = createTestDb();
    insertConversation(db, "conv-empty");

    const result = db
      .select({ max: sql<number>`COALESCE(MAX(${message.sequence}), 0)` })
      .from(message)
      .where(eq(message.conversationId, "conv-empty"))
      .get();
    expect((result?.max ?? 0) + 1).toBe(1);
  });

  it("returns max+1 for a conversation with existing messages", () => {
    const db = createTestDb();
    insertConversation(db, "conv-with-msgs");
    insertMessage(db, "conv-with-msgs", 1);
    insertMessage(db, "conv-with-msgs", 2);
    insertMessage(db, "conv-with-msgs", 3);

    const result = db
      .select({ max: sql<number>`COALESCE(MAX(${message.sequence}), 0)` })
      .from(message)
      .where(eq(message.conversationId, "conv-with-msgs"))
      .get();
    expect((result?.max ?? 0) + 1).toBe(4);
  });

  it("scopes sequence per conversation", () => {
    const db = createTestDb();
    insertConversation(db, "conv-a");
    insertConversation(db, "conv-b");
    insertMessage(db, "conv-a", 1);
    insertMessage(db, "conv-a", 2);
    insertMessage(db, "conv-b", 1);

    const resultA = db
      .select({ max: sql<number>`COALESCE(MAX(${message.sequence}), 0)` })
      .from(message)
      .where(eq(message.conversationId, "conv-a"))
      .get();
    const resultB = db
      .select({ max: sql<number>`COALESCE(MAX(${message.sequence}), 0)` })
      .from(message)
      .where(eq(message.conversationId, "conv-b"))
      .get();
    expect((resultA?.max ?? 0) + 1).toBe(3);
    expect((resultB?.max ?? 0) + 1).toBe(2);
  });
});

describe("message ordering by sequence", () => {
  it("returns messages in sequence order regardless of timestamp", () => {
    const db = createTestDb();
    insertConversation(db, "conv-order");

    // Insert messages with out-of-order timestamps but correct sequences
    db.insert(message).values({
      id: "msg-late-ts",
      conversationId: "conv-order",
      role: "user",
      content: "First by sequence",
      timestamp: "2026-05-22T12:00:00.000Z",
      sequence: 1,
    }).run();

    db.insert(message).values({
      id: "msg-early-ts",
      conversationId: "conv-order",
      role: "assistant",
      content: "Second by sequence",
      timestamp: "2026-05-22T11:00:00.000Z",
      sequence: 2,
    }).run();

    const msgs = db
      .select()
      .from(message)
      .where(eq(message.conversationId, "conv-order"))
      .orderBy(sql`COALESCE(${message.sequence}, 999999999)`, message.timestamp)
      .all();

    expect(msgs).toHaveLength(2);
    expect(msgs[0].id).toBe("msg-late-ts");
    expect(msgs[1].id).toBe("msg-early-ts");
  });

  it("falls back to timestamp for null sequence", () => {
    const db = createTestDb();
    insertConversation(db, "conv-null-seq");

    db.insert(message).values({
      id: "msg-with-seq",
      conversationId: "conv-null-seq",
      role: "user",
      content: "Has sequence",
      timestamp: "2026-05-22T12:00:00.000Z",
      sequence: 1,
    }).run();

    db.insert(message).values({
      id: "msg-no-seq",
      conversationId: "conv-null-seq",
      role: "assistant",
      content: "No sequence",
      timestamp: "2026-05-22T11:00:00.000Z",
      sequence: null,
    }).run();

    const msgs = db
      .select()
      .from(message)
      .where(eq(message.conversationId, "conv-null-seq"))
      .orderBy(sql`COALESCE(${message.sequence}, 999999999)`, message.timestamp)
      .all();

    // Message with sequence 1 comes first, null-sequence falls to end
    expect(msgs[0].id).toBe("msg-with-seq");
    expect(msgs[1].id).toBe("msg-no-seq");
  });
});
