// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, storyVersion, storyWriterDraft, storyWriterSession, conversation, ticketLocalEdit, relatedStoryCandidate, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";

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

    it("enriches related candidates with the resolved sprint name (BRDG-397)", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100");
      // The candidate's ticket, synced locally with its sprint id + name cached.
      testDb.insert(ticket).values({
        jiraKey: "VPL-555", title: "Candidate", status: "IN PROGRESS", sprintName: "900",
      }).run();
      testDb.insert(sprintNameCache).values({ sprintId: "900", displayName: "BT: 139" }).run();

      const createRes = await POST(
        makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }),
        makeParams("VPL-100"),
      );
      const created = await createRes.json();

      testDb.insert(relatedStoryCandidate).values({
        id: "cand-1", sessionId: created.session.id, ticketKey: "VPL-100",
        jiraKey: "VPL-555", score: 80, title: "Candidate", status: "IN PROGRESS", isLinked: false,
        createdAt: new Date().toISOString(),
      }).run();

      const res = await GET(
        makeRequest(`${BASE}/VPL-100/story-writer`),
        makeParams("VPL-100"),
      );
      const data = await res.json();
      const cand = data.relatedCandidates.find((c: { jiraKey: string }) => c.jiraKey === "VPL-555");
      expect(cand.sprintName).toBe("BT: 139");
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

  describe("outdated detection", () => {
    function seedVersionAt(key: string, id: string, hash: string, createdAt: string, description?: string) {
      testDb.insert(storyVersion).values({
        id,
        jiraKey: key,
        description: description ?? `desc-${hash}`,
        contentHash: hash,
        createdAt,
      }).run();
    }

    async function getData(key: string) {
      const res = await GET(makeRequest(`${BASE}/${key}/story-writer`), makeParams(key));
      return res.json();
    }

    it("returns outdated=false when the latest Jira version matches the draft baseline", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100"); // hash abc123
      await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));

      const data = await getData("VPL-100");
      expect(data.session.baseVersionHash).toBe("abc123");
      expect(data.outdated).toBe(false);
    });

    it("returns outdated=true when a newer Jira version diverges from the baseline", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100"); // hash abc123, default createdAt
      await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));

      // A newer version arrives (e.g. pushed from another tab)
      seedVersionAt("VPL-100", "sv-2", "def456", "2099-01-01 00:00:00");

      const data = await getData("VPL-100");
      expect(data.outdated).toBe(true);
    });

    it("returns outdated=false when the baseline is null (no recorded baseline)", async () => {
      // Ticket with no storyVersion -> session.baseVersionHash is null
      seedTicket(testDb, "VPL-100");
      await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));
      // Even if a version appears later, a null baseline must not flag outdated
      seedVersionAt("VPL-100", "sv-late", "zzz999", "2099-01-01 00:00:00");

      const data = await getData("VPL-100");
      expect(data.session.baseVersionHash).toBeNull();
      expect(data.outdated).toBe(false);
    });

    it("does not flag outdated after accepting an AI draft (baseline unchanged)", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100");
      const createRes = await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));
      const { session } = await createRes.json();

      testDb.insert(storyWriterDraft).values({
        id: "draft-1",
        sessionId: session.id,
        draftIndex: 0,
        content: "AI suggested content",
      }).run();

      await PATCH(
        makeRequest(`${BASE}/VPL-100/story-writer`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acceptDraftId: "draft-1" }),
        }),
        makeParams("VPL-100"),
      );

      const data = await getData("VPL-100");
      expect(data.session.localDraft).toBe("AI suggested content");
      expect(data.outdated).toBe(false);
    });

    it("PATCH rebaseBaseline clears the outdated flag", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100");
      await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));
      seedVersionAt("VPL-100", "sv-2", "def456", "2099-01-01 00:00:00");

      expect((await getData("VPL-100")).outdated).toBe(true);

      const patchRes = await PATCH(
        makeRequest(`${BASE}/VPL-100/story-writer`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rebaseBaseline: true }),
        }),
        makeParams("VPL-100"),
      );
      const patched = await patchRes.json();
      expect(patched.session.baseVersionHash).toBe("def456");
      expect((await getData("VPL-100")).outdated).toBe(false);
    });

    it("computes targetOutdated from the target ticket's local-edit baseline", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100");
      seedTicket(testDb, "VPL-101");
      seedVersionAt("VPL-101", "sv-t1", "tgt-old", "2026-01-01 00:00:00");
      const createRes = await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));
      const { session } = await createRes.json();

      // Link the target and give it a local edit based on an older version
      testDb.update(storyWriterSession)
        .set({ targetTicketKey: "VPL-101" })
        .where(eq(storyWriterSession.id, session.id))
        .run();
      testDb.insert(ticketLocalEdit).values({
        id: "tle-1",
        ticketKey: "VPL-101",
        field: "description",
        localValue: "target draft",
        baseJiraVersion: "tgt-old",
        isDraft: true,
      }).run();

      // No newer target version yet -> not outdated
      expect((await getData("VPL-100")).targetOutdated).toBe(false);

      // A newer target version diverges from the edit's baseline -> outdated
      seedVersionAt("VPL-101", "sv-t2", "tgt-new", "2099-01-01 00:00:00");
      expect((await getData("VPL-100")).targetOutdated).toBe(true);
    });

    it("self-heals outdated when the latest version content matches the draft", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100"); // hash abc123
      await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));

      // Bridge's own push echoes back: new hash, same visible content as the draft
      seedVersionAt("VPL-100", "sv-2", "def456", "2099-01-01 00:00:00", "Original description from Jira");

      const data = await getData("VPL-100");
      expect(data.outdated).toBe(false);
      // The baseline was rebased onto the echoed version
      expect(data.session.baseVersionHash).toBe("def456");
    });

    it("self-heals targetOutdated when the target version content matches the target edit", async () => {
      seedTicket(testDb, "VPL-100");
      seedVersion(testDb, "VPL-100");
      seedTicket(testDb, "VPL-101");
      seedVersionAt("VPL-101", "sv-t1", "tgt-old", "2026-01-01 00:00:00");
      const createRes = await POST(makeRequest(`${BASE}/VPL-100/story-writer`, { method: "POST" }), makeParams("VPL-100"));
      const { session } = await createRes.json();

      testDb.update(storyWriterSession)
        .set({ targetTicketKey: "VPL-101" })
        .where(eq(storyWriterSession.id, session.id))
        .run();
      testDb.insert(ticketLocalEdit).values({
        id: "tle-1",
        ticketKey: "VPL-101",
        field: "description",
        localValue: "target draft",
        baseJiraVersion: "tgt-old",
        isDraft: true,
      }).run();

      // The target push echoes back with a new hash but identical content
      seedVersionAt("VPL-101", "sv-t2", "tgt-new", "2099-01-01 00:00:00", "target draft");

      expect((await getData("VPL-100")).targetOutdated).toBe(false);
      const healedEdit = testDb.select().from(ticketLocalEdit).where(eq(ticketLocalEdit.id, "tle-1")).get();
      expect(healedEdit?.baseJiraVersion).toBe("tgt-new");
    });
  });
});
