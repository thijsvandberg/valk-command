// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedStoryWriterSession } from "@/test/builders";
import { epicChildDraft } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { PATCH } from "./route";

function makeParams(key: string, index: string): { params: Promise<{ key: string; index: string }> } {
  return { params: Promise.resolve({ key, index }) };
}

function patchReq(key: string, index: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/cards/${index}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function seedEpicWithCard(key: string, sessionId: string, cardIndex: number, body: string | null) {
  seedTicket(testDb, { jiraKey: key, type: "epic", title: "Epic" });
  const conv = seedConversation(testDb, { id: `conv-${sessionId}` });
  seedStoryWriterSession(testDb, {
    id: sessionId,
    ticketKey: key,
    conversationId: conv.id,
    status: "active",
    mode: "epic",
    phase: "refine",
  });
  testDb.insert(epicChildDraft).values({
    id: randomUUID(),
    sessionId,
    cardIndex,
    title: "Card",
    bullets: ["b"],
    body,
    status: "draft",
    suggestedLinks: [],
  }).run();
}

describe("PATCH /api/epics/[key]/writer/cards/[index]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("persists a hand-edited body for the card", async () => {
    seedEpicWithCard("VPL-C1", "sess-c1", 0, "old body");

    const res = await PATCH(
      patchReq("VPL-C1", "0", { body: "new worked-out body" }),
      makeParams("VPL-C1", "0"),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.body).toBe("new worked-out body");

    const card = testDb.select().from(epicChildDraft).where(eq(epicChildDraft.cardIndex, 0)).get();
    expect(card!.body).toBe("new worked-out body");
  });

  it("clears the body (dropping depth) when given an empty string", async () => {
    seedEpicWithCard("VPL-C2", "sess-c2", 0, "filled");

    const res = await PATCH(patchReq("VPL-C2", "0", { body: "   " }), makeParams("VPL-C2", "0"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.body).toBeNull();

    const card = testDb.select().from(epicChildDraft).where(eq(epicChildDraft.cardIndex, 0)).get();
    expect(card!.body).toBeNull();
  });

  it("rejects a non-string body", async () => {
    seedEpicWithCard("VPL-C3", "sess-c3", 0, null);
    const res = await PATCH(patchReq("VPL-C3", "0", { body: 42 }), makeParams("VPL-C3", "0"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown card index", async () => {
    seedEpicWithCard("VPL-C4", "sess-c4", 0, null);
    const res = await PATCH(patchReq("VPL-C4", "5", { body: "x" }), makeParams("VPL-C4", "5"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when there is no active epic session", async () => {
    const res = await PATCH(patchReq("VPL-NONE", "0", { body: "x" }), makeParams("VPL-NONE", "0"));
    expect(res.status).toBe(404);
  });
});
