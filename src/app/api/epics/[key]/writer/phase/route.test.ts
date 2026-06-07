// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedStoryWriterSession } from "@/test/builders";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { PATCH } from "./route";
import { GET } from "../session/route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function patchReq(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/phase`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function getReq(key: string): Request {
  return new Request(`http://localhost:3100/api/epics/${key}/writer/session`);
}

function seedEpicSession(key: string) {
  seedTicket(testDb, { jiraKey: key, type: "epic" });
  const conv = seedConversation(testDb, { id: `conv-${key}` });
  seedStoryWriterSession(testDb, {
    id: `sess-${key}`,
    ticketKey: key,
    conversationId: conv.id,
    status: "active",
    mode: "epic",
    phase: "feed",
  });
}

describe("PATCH /api/epics/[key]/writer/phase", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("persists the new phase and a follow-up GET returns it", async () => {
    seedEpicSession("VPL-P1");

    const res = await PATCH(patchReq("VPL-P1", { phase: "discovery" }), makeParams("VPL-P1"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.session.phase).toBe("discovery");

    const getRes = await GET(getReq("VPL-P1"), makeParams("VPL-P1"));
    const getData = await getRes.json();
    expect(getData.session.phase).toBe("discovery");
  });

  it("allows free movement (e.g. feed after detail, with no transition guard)", async () => {
    seedEpicSession("VPL-P2");

    const toDetail = await PATCH(patchReq("VPL-P2", { phase: "detail" }), makeParams("VPL-P2"));
    expect((await toDetail.json()).session.phase).toBe("detail");

    const backToFeed = await PATCH(patchReq("VPL-P2", { phase: "feed" }), makeParams("VPL-P2"));
    expect(backToFeed.status).toBe(200);
    expect((await backToFeed.json()).session.phase).toBe("feed");
  });

  it("rejects an unknown phase value", async () => {
    seedEpicSession("VPL-P3");
    const res = await PATCH(patchReq("VPL-P3", { phase: "nonsense" }), makeParams("VPL-P3"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when no active epic session exists", async () => {
    seedTicket(testDb, { jiraKey: "VPL-P4", type: "epic" });
    const res = await PATCH(patchReq("VPL-P4", { phase: "refine" }), makeParams("VPL-P4"));
    expect(res.status).toBe(404);
  });
});
