// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedConversation, seedMessage, seedStoryWriterSession } from "@/test/builders";
import { storyWriterSession } from "@/db/schema";
import { eq } from "drizzle-orm";

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
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

import { GET, POST } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

const epicReq = (key: string) =>
  new Request(`http://localhost:3100/api/epics/${key}/writer/session`);

describe("POST /api/epics/[key]/writer/session", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates an epic-mode session in the feed phase", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E1", type: "epic", title: "My Epic", description: "Some body" });

    const res = await POST(epicReq("VPL-E1"), makeParams("VPL-E1"));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.session.mode).toBe("epic");
    expect(data.session.phase).toBe("feed");
    expect(data.session.localDraft).toBe("Some body");
    expect(data.session.ticketKey).toBe("VPL-E1");
  });

  it("supports a near-empty epic: localDraft becomes empty string", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E2", type: "epic", title: "Thin Epic", description: null });

    const res = await POST(epicReq("VPL-E2"), makeParams("VPL-E2"));
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.session.localDraft).toBe("");
  });

  it("returns 404 when the epic does not exist", async () => {
    const res = await POST(epicReq("VPL-MISSING"), makeParams("VPL-MISSING"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when an active session already exists for the epic", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E3", type: "epic" });
    const conv = seedConversation(testDb, { id: "conv-e3" });
    seedStoryWriterSession(testDb, {
      id: "sess-e3",
      ticketKey: "VPL-E3",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
    });

    const res = await POST(epicReq("VPL-E3"), makeParams("VPL-E3"));
    expect(res.status).toBe(409);
  });
});

describe("GET /api/epics/[key]/writer/session", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null session when none exists", async () => {
    const res = await GET(epicReq("VPL-NONE"), makeParams("VPL-NONE"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.session).toBeNull();
    expect(data.messages).toEqual([]);
  });

  it("resumes: restores the session, phase, and chat history", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E4", type: "epic", title: "Resumable" });
    const conv = seedConversation(testDb, { id: "conv-e4" });
    seedStoryWriterSession(testDb, {
      id: "sess-e4",
      ticketKey: "VPL-E4",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "discovery",
      localDraft: "Working draft",
    });
    seedMessage(testDb, { conversationId: conv.id, role: "user", content: "Hello epic" });

    const res = await GET(epicReq("VPL-E4"), makeParams("VPL-E4"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.session.id).toBe("sess-e4");
    expect(data.session.phase).toBe("discovery");
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].content).toBe("Hello epic");
  });

  it("ignores a story-mode session on the same key", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E5", type: "epic" });
    const conv = seedConversation(testDb, { id: "conv-e5" });
    seedStoryWriterSession(testDb, {
      id: "sess-e5",
      ticketKey: "VPL-E5",
      conversationId: conv.id,
      status: "active",
      mode: "story",
    });

    const res = await GET(epicReq("VPL-E5"), makeParams("VPL-E5"));
    const data = await res.json();
    expect(data.session).toBeNull();
  });

  it("heals an empty draft from the epic description", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E6", type: "epic", description: "Live description" });
    const conv = seedConversation(testDb, { id: "conv-e6" });
    seedStoryWriterSession(testDb, {
      id: "sess-e6",
      ticketKey: "VPL-E6",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      localDraft: null,
    });

    const res = await GET(epicReq("VPL-E6"), makeParams("VPL-E6"));
    const data = await res.json();
    expect(data.session.localDraft).toBe("Live description");

    const persisted = testDb.select().from(storyWriterSession).where(eq(storyWriterSession.id, "sess-e6")).get();
    expect(persisted?.localDraft).toBe("Live description");
  });
});
