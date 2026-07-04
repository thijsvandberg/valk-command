// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

const mockUpsertLocalEdit = vi.fn();
const mockPushToJira = vi.fn();
vi.mock("@/services/ticket-service", () => ({
  upsertLocalEdit: (...args: unknown[]) => mockUpsertLocalEdit(...args),
  pushToJira: (...args: unknown[]) => mockPushToJira(...args),
}));

vi.mock("@/lib/acting-user", () => ({
  getActingUser: vi.fn().mockResolvedValue(null),
}));

import { GET, PUT } from "./route";
import { ticket, ticketMetadata, ticketLocalEdit } from "@/db/schema";
import { appendTestDocBlock } from "@/lib/test-doc";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const DOC = "**Title**\n\n- Confirm the thing works";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/test-doc`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedTicket(key: string, description?: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: "Some story",
    type: "story",
    status: "TEST",
    description: description ?? null,
  }).run();
}

function getMetadata(key: string) {
  return testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get();
}

describe("PUT /api/tickets/[key]/test-doc", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockUpsertLocalEdit.mockReset();
    mockPushToJira.mockReset();
    mockPushToJira.mockResolvedValue({ success: true, message: "ok", newContentHash: null });
  });

  it("returns 409 for draft tickets and writes nothing", async () => {
    const response = await PUT(makeRequest("DRAFT-abc", { markdown: DOC }), makeParams("DRAFT-abc"));
    expect(response.status).toBe(409);
    expect(mockUpsertLocalEdit).not.toHaveBeenCalled();
    expect(mockPushToJira).not.toHaveBeenCalled();
  });

  it("returns 400 when markdown is missing or empty", async () => {
    seedTicket("VPL-10");
    for (const body of [{}, { markdown: "  " }]) {
      const response = await PUT(makeRequest("VPL-10", body), makeParams("VPL-10"));
      expect(response.status).toBe(400);
    }
  });

  it("rejects bodies combining markdown with notNeeded and writes nothing (BRDG-470)", async () => {
    seedTicket("VPL-10");
    for (const body of [
      { markdown: DOC, notNeeded: true },
      { markdown: DOC, notNeeded: false },
    ]) {
      const response = await PUT(makeRequest("VPL-10", body), makeParams("VPL-10"));
      expect(response.status).toBe(400);
    }
    expect(getMetadata("VPL-10")).toBeUndefined();
    expect(mockPushToJira).not.toHaveBeenCalled();
  });

  it("returns 404 when the ticket does not exist", async () => {
    const response = await PUT(makeRequest("VPL-999", { markdown: DOC }), makeParams("VPL-999"));
    expect(response.status).toBe(404);
  });

  it("saves the Bridge copy and pushes exactly one expand block to the description", async () => {
    seedTicket("VPL-10", "### Story\n\nContent");

    const response = await PUT(
      makeRequest("VPL-10", { markdown: DOC, classification: "ok" }),
      makeParams("VPL-10"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, pushed: true });

    const meta = getMetadata("VPL-10");
    expect(meta?.testDoc).toBe(DOC);
    expect(meta?.testDocClassification).toBe("ok");
    expect(meta?.testDocUpdatedAt).toBeTruthy();

    expect(mockUpsertLocalEdit).toHaveBeenCalledTimes(1);
    const [key, input] = mockUpsertLocalEdit.mock.calls[0];
    expect(key).toBe("VPL-10");
    expect(input.field).toBe("description");
    expect(input.localValue.match(/:::expand Test documentation/g)).toHaveLength(1);
    expect(input.localValue).toContain("### Story\n\nContent");
    expect(input.localValue).toContain(DOC);
    expect(mockPushToJira).toHaveBeenCalledWith("VPL-10", null, null);
  });

  it("replaces an existing block instead of duplicating", async () => {
    seedTicket("VPL-10", appendTestDocBlock("### Story", "old doc"));

    await PUT(makeRequest("VPL-10", { markdown: DOC }), makeParams("VPL-10"));

    const [, input] = mockUpsertLocalEdit.mock.calls[0];
    expect(input.localValue.match(/:::expand Test documentation/g)).toHaveLength(1);
    expect(input.localValue).not.toContain("old doc");
  });

  it("builds on an unpushed local-edit description when present", async () => {
    seedTicket("VPL-10", "stale mirror");
    testDb.insert(ticketLocalEdit).values({
      id: randomUUID(),
      ticketKey: "VPL-10",
      field: "description",
      localValue: "fresh local edit",
    }).run();

    await PUT(makeRequest("VPL-10", { markdown: DOC }), makeParams("VPL-10"));

    const [, input] = mockUpsertLocalEdit.mock.calls[0];
    expect(input.localValue).toContain("fresh local edit");
    expect(input.localValue).not.toContain("stale mirror");
  });

  it("returns the conflict outcome with saved=true and keeps the Bridge copy", async () => {
    seedTicket("VPL-10", "Content");
    mockPushToJira.mockResolvedValue({
      conflict: true,
      contentChanged: true,
      message: "Jira was updated since your edit.",
    });

    const response = await PUT(makeRequest("VPL-10", { markdown: DOC }), makeParams("VPL-10"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.saved).toBe(true);
    expect(data.conflict).toBe(true);
    expect(getMetadata("VPL-10")?.testDoc).toBe(DOC);
  });

  it("defaults an unknown classification to ok", async () => {
    seedTicket("VPL-10", "Content");
    await PUT(
      makeRequest("VPL-10", { markdown: DOC, classification: "banana" }),
      makeParams("VPL-10"),
    );
    expect(getMetadata("VPL-10")?.testDocClassification).toBe("ok");
  });

  it("persists needs_input classification", async () => {
    seedTicket("VPL-10", "Content");
    await PUT(
      makeRequest("VPL-10", { markdown: DOC, classification: "needs_input" }),
      makeParams("VPL-10"),
    );
    expect(getMetadata("VPL-10")?.testDocClassification).toBe("needs_input");
  });

  it("accepting clears the draft cache", async () => {
    seedTicket("VPL-10", "Content");
    testDb.insert(ticketMetadata).values({
      jiraKey: "VPL-10",
      testDocDraft: "draft doc",
      testDocDraftClassification: "ok",
      testDocDraftGeneratedAt: "2026-07-02T10:00:00.000Z",
    }).run();

    await PUT(makeRequest("VPL-10", { markdown: DOC }), makeParams("VPL-10"));

    const meta = getMetadata("VPL-10");
    expect(meta?.testDoc).toBe(DOC);
    expect(meta?.testDocDraft).toBeNull();
    expect(meta?.testDocDraftGeneratedAt).toBeNull();
  });

  describe("notNeeded marker (PO judgement)", () => {
    it("stores the marker Bridge-only: no doc, no Jira write, draft cleared", async () => {
      seedTicket("VPL-10", "Content");
      testDb.insert(ticketMetadata).values({
        jiraKey: "VPL-10",
        testDocDraft: "stale draft",
      }).run();

      const response = await PUT(makeRequest("VPL-10", { notNeeded: true }), makeParams("VPL-10"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true, notNeeded: true });

      const meta = getMetadata("VPL-10");
      expect(meta?.testDoc).toBeNull();
      expect(meta?.testDocClassification).toBe("not_stakeholder_relevant");
      expect(meta?.testDocDraft).toBeNull();
      expect(mockUpsertLocalEdit).not.toHaveBeenCalled();
      expect(mockPushToJira).not.toHaveBeenCalled();
    });

    it("404s on unknown tickets and 409s on draft keys", async () => {
      expect((await PUT(makeRequest("VPL-999", { notNeeded: true }), makeParams("VPL-999"))).status).toBe(404);
      expect((await PUT(makeRequest("DRAFT-abc", { notNeeded: true }), makeParams("DRAFT-abc"))).status).toBe(409);
    });
  });

  describe("unset marker (notNeeded: false, BRDG-467)", () => {
    it("clears the marker Bridge-only and leaves drafts untouched", async () => {
      seedTicket("VPL-10");
      testDb.insert(ticketMetadata).values({
        jiraKey: "VPL-10",
        testDocClassification: "not_stakeholder_relevant",
        testDocUpdatedAt: "2026-07-01T09:00:00.000Z",
        testDocDraft: "draft doc",
        testDocDraftClassification: "ok",
        testDocDraftGeneratedAt: "2026-07-02T10:00:00.000Z",
      }).run();

      const response = await PUT(makeRequest("VPL-10", { notNeeded: false }), makeParams("VPL-10"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true, notNeeded: false });

      const meta = getMetadata("VPL-10");
      expect(meta?.testDocClassification).toBeNull();
      expect(meta?.testDocUpdatedAt).toBeNull();
      expect(meta?.testDocDraft).toBe("draft doc");
      expect(meta?.testDocDraftClassification).toBe("ok");
      expect(meta?.testDocDraftGeneratedAt).toBe("2026-07-02T10:00:00.000Z");
      expect(mockUpsertLocalEdit).not.toHaveBeenCalled();
      expect(mockPushToJira).not.toHaveBeenCalled();
    });

    it("400s when the ticket has an accepted doc and changes nothing", async () => {
      seedTicket("VPL-10");
      testDb.insert(ticketMetadata).values({
        jiraKey: "VPL-10",
        testDoc: "accepted doc",
        testDocUpdatedAt: "2026-07-01T09:00:00.000Z",
        testDocClassification: "ok",
      }).run();

      const response = await PUT(makeRequest("VPL-10", { notNeeded: false }), makeParams("VPL-10"));
      expect(response.status).toBe(400);

      const meta = getMetadata("VPL-10");
      expect(meta?.testDoc).toBe("accepted doc");
      expect(meta?.testDocClassification).toBe("ok");
    });

    it("is an idempotent no-op when no marker is set", async () => {
      seedTicket("VPL-10");
      const response = await PUT(makeRequest("VPL-10", { notNeeded: false }), makeParams("VPL-10"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: true, notNeeded: false });
      expect(getMetadata("VPL-10")).toBeUndefined();
    });

    it("404s on unknown tickets and 409s on draft keys", async () => {
      expect((await PUT(makeRequest("VPL-999", { notNeeded: false }), makeParams("VPL-999"))).status).toBe(404);
      expect((await PUT(makeRequest("DRAFT-abc", { notNeeded: false }), makeParams("DRAFT-abc"))).status).toBe(409);
    });
  });

  describe("GET (cached doc lookup)", () => {
    function makeGetRequest(key: string): Request {
      return new Request(`http://localhost:3100/api/tickets/${key}/test-doc`);
    }

    it("returns null saved and draft when nothing is stored", async () => {
      seedTicket("VPL-10");
      const response = await GET(makeGetRequest("VPL-10"), makeParams("VPL-10"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        storyUpdatedAt: null,
        notNeeded: false,
        notNeededAt: null,
        saved: null,
        draft: null,
      });
    });

    it("reports the not-needed marker with its date", async () => {
      seedTicket("VPL-10");
      testDb.insert(ticketMetadata).values({
        jiraKey: "VPL-10",
        testDocClassification: "not_stakeholder_relevant",
        testDocUpdatedAt: "2026-07-01T09:00:00.000Z",
      }).run();

      const data = await (await GET(makeGetRequest("VPL-10"), makeParams("VPL-10"))).json();
      expect(data.notNeeded).toBe(true);
      expect(data.notNeededAt).toBe("2026-07-01T09:00:00.000Z");
      expect(data.saved).toBeNull();
    });

    it("returns both the accepted doc and the draft cache", async () => {
      seedTicket("VPL-10");
      testDb.insert(ticketMetadata).values({
        jiraKey: "VPL-10",
        testDoc: "accepted doc",
        testDocUpdatedAt: "2026-07-01T09:00:00.000Z",
        testDocClassification: "ok",
        testDocDraft: "draft doc",
        testDocDraftClassification: "needs_input",
        testDocDraftGeneratedAt: "2026-07-02T10:00:00.000Z",
      }).run();

      const data = await (await GET(makeGetRequest("VPL-10"), makeParams("VPL-10"))).json();
      // An accepted doc is never reported as the not-needed marker.
      expect(data.notNeeded).toBe(false);
      expect(data.saved).toEqual({
        markdown: "accepted doc",
        classification: "ok",
        updatedAt: "2026-07-01T09:00:00.000Z",
      });
      expect(data.draft).toEqual({
        markdown: "draft doc",
        classification: "needs_input",
        generatedAt: "2026-07-02T10:00:00.000Z",
      });
    });
  });
});
