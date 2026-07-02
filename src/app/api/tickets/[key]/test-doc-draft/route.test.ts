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

import { PUT } from "./route";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/test-doc-draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedTicket(key: string) {
  testDb.insert(ticket).values({ jiraKey: key, title: "Story", type: "story", status: "TEST" }).run();
}

function getMetadata(key: string) {
  return testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get();
}

describe("PUT /api/tickets/[key]/test-doc-draft", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("stores the draft with classification and timestamp", async () => {
    seedTicket("VPL-10");
    const response = await PUT(
      makeRequest("VPL-10", { markdown: "**Draft**", classification: "not_stakeholder_relevant" }),
      makeParams("VPL-10"),
    );
    expect(response.status).toBe(200);

    const meta = getMetadata("VPL-10");
    expect(meta?.testDocDraft).toBe("**Draft**");
    expect(meta?.testDocDraftClassification).toBe("not_stakeholder_relevant");
    expect(meta?.testDocDraftGeneratedAt).toBeTruthy();
  });

  it("overwrites an earlier draft and leaves the accepted doc untouched", async () => {
    seedTicket("VPL-10");
    testDb.insert(ticketMetadata).values({
      jiraKey: "VPL-10",
      testDoc: "accepted",
      testDocDraft: "old draft",
    }).run();

    await PUT(makeRequest("VPL-10", { markdown: "new draft" }), makeParams("VPL-10"));

    const meta = getMetadata("VPL-10");
    expect(meta?.testDocDraft).toBe("new draft");
    expect(meta?.testDoc).toBe("accepted");
  });

  it("rejects draft tickets, missing markdown, and unknown tickets", async () => {
    expect((await PUT(makeRequest("DRAFT-abc", { markdown: "x" }), makeParams("DRAFT-abc"))).status).toBe(409);
    seedTicket("VPL-10");
    expect((await PUT(makeRequest("VPL-10", {}), makeParams("VPL-10"))).status).toBe(400);
    expect((await PUT(makeRequest("VPL-999", { markdown: "x" }), makeParams("VPL-999"))).status).toBe(404);
  });
});
