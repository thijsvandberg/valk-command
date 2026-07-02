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

import { PUT } from "./route";
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
});
