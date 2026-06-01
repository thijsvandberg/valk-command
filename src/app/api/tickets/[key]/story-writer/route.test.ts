// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, storyVersion, storyWriterDraft, storyWriterSession, conversation } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

import { GET, POST, PATCH, DELETE } from "./route";

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
      description: "Original description from Jira",
    })
    .run();
}

function seedVersion(db: BetterSQLite3Database<typeof schema>, key: string) {
  db.insert(storyVersion)
    .values({
      id: "sv-1",
      jiraKey: key,
      description: "Original description from Jira",
      contentHash: "abc123",
    })
    .run();
}

function makeParams(key: string) {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

const BASE = "http://localhost:3100/api/tickets";

describe("Story Writer Session CRUD", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  describe("GET", () => {
    it("returns null session when no active session exists", async () => {
      seedTicket(testDb, "VPL-100");

      const res = await GET(
        makeRequest(`${BASE}/VPL-100/story-writer`),
        makeParams("VPL-100"),
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.session).toBeNull();
      expect(data.messages).toEqual([]);
      expect(data.aiDrafts).toEqual([]);
    });

    it("returns active session with messages and drafts", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100");

      const createRes = await POST(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }),
        makeParams("VPL-100"),
      );
      expect(createRes.status).toBe(201);

      const res = await GET(
        makeRequest(`${BASE}/VPL-100/story-writer`),
        makeParams("VPL-100"),
      );
      const data = await res.json();

      expect(data.session).not.toBeNull();
      expect(data.session.ticketKey).toBe("VPL-100");
      expect(data.session.status).toBe("active");
      expect(data.session.localDraft).toBe("Original description from Jira");
      expect(data.session.baseVersionHash).toBe("abc123");
      expect(data.aiDrafts).toEqual([]);
    });

    it("heals an empty localDraft from the live ticket description", async () => {
      // Simulates a session created before the ticket had a description: the
      // one-time snapshot was empty, and the Jira description arrived later.
      testDb.insert(ticket).values({
        jiraKey: "VPL-200",
        title: "Ticket VPL-200",
        status: "TO DO",
        description: "",
      }).run();

      testDb.insert(conversation).values({
        id: "conv-200",
        title: "Story Writer: VPL-200",
        relatedTicket: "VPL-200",
      }).run();

      testDb.insert(storyWriterSession).values({
        id: "sws-200",
        ticketKey: "VPL-200",
        conversationId: "conv-200",
        status: "active",
        localDraft: "",
        localTitle: "Ticket VPL-200",
      }).run();

      // Description arrives later (e.g. via Jira sync)
      const { eq } = await import("drizzle-orm");
      testDb.update(ticket)
        .set({ description: "Description that arrived after the session" })
        .where(eq(ticket.jiraKey, "VPL-200"))
        .run();

      const res = await GET(
        makeRequest(`${BASE}/VPL-200/story-writer`),
        makeParams("VPL-200"),
      );
      const data = await res.json();

      expect(data.session.localDraft).toBe("Description that arrived after the session");

      // The heal is persisted so subsequent loads are instant
      const persisted = testDb
        .select()
        .from(storyWriterSession)
        .where(eq(storyWriterSession.id, "sws-200"))
        .get();
      expect(persisted?.localDraft).toBe("Description that arrived after the session");
    });
  });

  describe("POST", () => {
    it("creates a new session", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100");

      const res = await POST(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }),
        makeParams("VPL-100"),
      );
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.session.ticketKey).toBe("VPL-100");
      expect(data.session.status).toBe("active");
      expect(data.session.localDraft).toBe("Original description from Jira");
      expect(data.aiDrafts).toEqual([]);
    });

    it("returns 409 when active session already exists", async () => {
      seedTicket(testDb, "VPL-100");

      await POST(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }),
        makeParams("VPL-100"),
      );

      const res = await POST(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }),
        makeParams("VPL-100"),
      );

      expect(res.status).toBe(409);
    });

    it("returns 404 when ticket does not exist", async () => {
      const res = await POST(
        makeRequest(`${BASE}/VPL-999/story-writer`, { method: "POST" }),
        makeParams("VPL-999"),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH", () => {
    async function createSession(key: string) {
      seedTicket(testDb, key);
      return POST(makeRequest(`${BASE}/${key}/story-writer`, { method: "POST" }), makeParams(key));
    }

    it("updates localDraft", async () => {
      await createSession("VPL-100");

      const res = await PATCH(
        makeRequest(`${BASE}/VPL-100/story-writer`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localDraft: "Updated draft" }),
        }),
        makeParams("VPL-100"),
      );
      const data = await res.json();

      expect(data.session.localDraft).toBe("Updated draft");
    });

    it("accepts a specific AI draft by ID", async () => {
      const createRes = await createSession("VPL-100");
      const { session } = await createRes.json();

      // Insert an AI draft
      testDb.insert(storyWriterDraft).values({
        id: "draft-1",
        sessionId: session.id,
        draftIndex: 0,
        content: "AI suggested content",
      }).run();

      const res = await PATCH(
        makeRequest(`${BASE}/VPL-100/story-writer`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acceptDraftId: "draft-1" }),
        }),
        makeParams("VPL-100"),
      );
      const data = await res.json();

      expect(data.session.localDraft).toBe("AI suggested content");
    });

    it("returns 404 when no active session", async () => {
      seedTicket(testDb, "VPL-100");

      const res = await PATCH(
        makeRequest(`${BASE}/VPL-100/story-writer`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localDraft: "test" }),
        }),
        makeParams("VPL-100"),
      );

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE", () => {
    async function createSession(key: string) {
      seedTicket(testDb, key);
      return POST(makeRequest(`${BASE}/${key}/story-writer`, { method: "POST" }), makeParams(key));
    }

    it("discards the active session and cleans up drafts", async () => {
      const createRes = await createSession("VPL-100");
      const { session } = await createRes.json();

      // Add a draft
      testDb.insert(storyWriterDraft).values({
        id: "draft-1",
        sessionId: session.id,
        draftIndex: 0,
        content: "AI draft",
      }).run();

      const res = await DELETE(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "DELETE" }),
        makeParams("VPL-100"),
      );

      expect(res.status).toBe(200);

      // Session should no longer be active
      const getRes = await GET(
        makeRequest(`${BASE}/VPL-100/story-writer`),
        makeParams("VPL-100"),
      );
      const data = await getRes.json();
      expect(data.session).toBeNull();
    });

    it("deletes conversation when flag is set", async () => {
      await createSession("VPL-100");

      const getRes = await GET(
        makeRequest(`${BASE}/VPL-100/story-writer`),
        makeParams("VPL-100"),
      );
      const { session } = await getRes.json();

      const res = await DELETE(
        makeRequest(`${BASE}/VPL-100/story-writer?deleteConversation=true`, { method: "DELETE" }),
        makeParams("VPL-100"),
      );

      expect(res.status).toBe(200);

      const { conversation: convTable } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const conv = testDb.select().from(convTable).where(eq(convTable.id, session.conversationId)).get();
      expect(conv).toBeUndefined();
    });

    it("allows creating a new session after discard", async () => {
      await createSession("VPL-100");

      await DELETE(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "DELETE" }),
        makeParams("VPL-100"),
      );

      const res = await POST(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }),
        makeParams("VPL-100"),
      );
      expect(res.status).toBe(201);
    });
  });
});
