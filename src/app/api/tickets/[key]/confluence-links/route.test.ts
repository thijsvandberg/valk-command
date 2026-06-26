// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { POST, DELETE } from "./route";
import { ticket, ticketConfluenceLink } from "@/db/schema";

const KEY = "VPL-1";

function makeRequest(method: string, body?: unknown): NextRequest {
  const url = `http://localhost:3100/api/tickets/${KEY}/confluence-links`;
  if (body === undefined) {
    return new NextRequest(url, { method });
  }
  return new NextRequest(url, {
    method,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function ctx() {
  return { params: Promise.resolve({ key: KEY }) };
}

describe("POST /api/tickets/[key]/confluence-links", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(ticket).values({ jiraKey: KEY, title: "Test", status: "TO DO" }).run();
  });

  it("returns 400 on malformed JSON body (not 500)", async () => {
    const res = await POST(makeRequest("POST", "not json"), ctx());
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest("POST", { pageId: "123" }), ctx());
    expect(res.status).toBe(400);
  });

  it("persists a valid link and returns 201", async () => {
    const res = await POST(
      makeRequest("POST", { pageId: "123", pageTitle: "Spec", pageUrl: "http://wiki/123" }),
      ctx(),
    );
    expect(res.status).toBe(201);

    const rows = testDb.select().from(ticketConfluenceLink).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].pageId).toBe("123");
    expect(rows[0].source).toBe("manual");
  });
});

describe("DELETE /api/tickets/[key]/confluence-links", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(ticket).values({ jiraKey: KEY, title: "Test", status: "TO DO" }).run();
  });

  it("returns 400 on malformed JSON body (not 500)", async () => {
    const res = await DELETE(makeRequest("DELETE", "{nope"), ctx());
    expect(res.status).toBe(400);
  });

  it("returns 400 when linkId is missing", async () => {
    const res = await DELETE(makeRequest("DELETE", {}), ctx());
    expect(res.status).toBe(400);
  });

  it("removes the link for a valid body", async () => {
    testDb.insert(ticketConfluenceLink).values({
      id: "link-1",
      ticketKey: KEY,
      pageId: "123",
      pageTitle: "Spec",
      pageUrl: "http://wiki/123",
    }).run();

    const res = await DELETE(makeRequest("DELETE", { linkId: "link-1" }), ctx());
    expect(res.status).toBe(200);
    expect(testDb.select().from(ticketConfluenceLink).all()).toHaveLength(0);
  });
});
