// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedStoryWriterSession } from "@/test/builders";
import { epicChildDraft } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

const updateTicketFields = vi.fn().mockResolvedValue({ epicKey: "VPL-E1" });
vi.mock("@/lib/ticket-detail-builder", () => ({
  updateTicketFields: (...args: unknown[]) => updateTicketFields(...args),
}));

import { POST } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}
function postReq(key: string, body: Record<string, unknown>) {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/link-existing`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function seedEpicSession(key: string, sessionId: string) {
  seedTicket(testDb, { jiraKey: key, type: "epic", title: "Epic" });
  const conv = seedConversation(testDb, { id: `conv-${sessionId}` });
  seedStoryWriterSession(testDb, {
    id: sessionId,
    ticketKey: key,
    conversationId: conv.id,
    status: "active",
    mode: "epic",
    phase: "breakdown",
  });
}

describe("POST /api/epics/[key]/writer/link-existing (BRDG-487)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    updateTicketFields.mockResolvedValue({ epicKey: "VPL-E1" });
  });

  it("re-parents an existing story and adds it as a created card", async () => {
    seedEpicSession("VPL-E1", "s1");
    seedTicket(testDb, { jiraKey: "VPL-100", type: "story", title: "Existing story" });

    const res = await POST(postReq("VPL-E1", { jiraKeys: ["VPL-100"] }), makeParams("VPL-E1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.linked).toEqual(["VPL-100"]);
    expect(updateTicketFields).toHaveBeenCalledWith("VPL-100", { epicKey: "VPL-E1" });

    const cards = testDb.select().from(epicChildDraft).where(eq(epicChildDraft.sessionId, "s1")).all();
    expect(cards).toHaveLength(1);
    expect(cards[0].jiraKey).toBe("VPL-100");
    expect(cards[0].status).toBe("created");
    expect(cards[0].title).toBe("Existing story");
  });

  it("skips an epic and reports it as failed (an epic cannot be a child)", async () => {
    seedEpicSession("VPL-E1", "s1");
    seedTicket(testDb, { jiraKey: "VPL-E2", type: "epic", title: "Another epic" });

    const res = await POST(postReq("VPL-E1", { jiraKeys: ["VPL-E2"] }), makeParams("VPL-E1"));
    expect(res.status).toBe(422);
    expect(updateTicketFields).not.toHaveBeenCalled();
  });

  it("never re-parents the epic to itself", async () => {
    seedEpicSession("VPL-E1", "s1");
    const res = await POST(postReq("VPL-E1", { jiraKeys: ["VPL-E1"] }), makeParams("VPL-E1"));
    expect(res.status).toBe(400);
    expect(updateTicketFields).not.toHaveBeenCalled();
  });

  it("returns 400 when no keys are given", async () => {
    seedEpicSession("VPL-E1", "s1");
    const res = await POST(postReq("VPL-E1", { jiraKeys: [] }), makeParams("VPL-E1"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when there is no active epic session", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", type: "story", title: "Existing" });
    const res = await POST(postReq("VPL-E9", { jiraKeys: ["VPL-100"] }), makeParams("VPL-E9"));
    expect(res.status).toBe(404);
  });
});
