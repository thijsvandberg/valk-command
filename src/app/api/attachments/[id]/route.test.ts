// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketAttachment } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: {
    JIRA_EMAIL: "test@example.com",
    JIRA_API_TOKEN: "test-token",
    NEXT_PUBLIC_JIRA_BASE_URL: "https://test.atlassian.net",
  },
}));

import { GET } from "./route";

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function getRequest(id: string): Request {
  return new Request(`http://localhost:3100/api/attachments/${id}`);
}

function seedAttachment(
  db: BetterSQLite3Database<typeof schema>,
  overrides: Partial<typeof ticketAttachment.$inferInsert> & { id: string; ticketKey: string },
) {
  db.insert(ticketAttachment).values({
    filename: "file.png",
    mimeType: "image/png",
    size: 1000,
    ...overrides,
  }).run();
}

describe("GET /api/attachments/[id]", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    testDb = createTestDb();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 404 when attachment not found", async () => {
    const res = await GET(getRequest("nonexistent"), makeParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when attachment has no jiraUrl", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "T1", status: "TO DO" }).run();
    seedAttachment(testDb, { id: "att-1", ticketKey: "VPL-1", jiraUrl: null });

    const res = await GET(getRequest("att-1"), makeParams("att-1"));
    expect(res.status).toBe(404);
  });

  it("returns 503 when Jira credentials are missing", async () => {
    const envMod = await import("@/lib/env");
    const origEmail = envMod.env.JIRA_EMAIL;
    const origToken = envMod.env.JIRA_API_TOKEN;
    (envMod.env as Record<string, string | undefined>).JIRA_EMAIL = "";
    (envMod.env as Record<string, string | undefined>).JIRA_API_TOKEN = "";

    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "T1", status: "TO DO" }).run();
    seedAttachment(testDb, { id: "att-1", ticketKey: "VPL-1", jiraUrl: "https://test.atlassian.net/file.png" });

    const res = await GET(getRequest("att-1"), makeParams("att-1"));
    expect(res.status).toBe(503);

    (envMod.env as Record<string, string | undefined>).JIRA_EMAIL = origEmail;
    (envMod.env as Record<string, string | undefined>).JIRA_API_TOKEN = origToken;
  });

  it("returns 403 for non-HTTPS URL (SSRF protection)", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "T1", status: "TO DO" }).run();
    seedAttachment(testDb, { id: "att-1", ticketKey: "VPL-1", jiraUrl: "http://test.atlassian.net/file.png" });

    const res = await GET(getRequest("att-1"), makeParams("att-1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for hostname not in allowlist (SSRF protection)", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "T1", status: "TO DO" }).run();
    seedAttachment(testDb, { id: "att-1", ticketKey: "VPL-1", jiraUrl: "https://evil.example.com/file.png" });

    const res = await GET(getRequest("att-1"), makeParams("att-1"));
    expect(res.status).toBe(403);
  });

  it("proxies file with correct headers on success", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "T1", status: "TO DO" }).run();
    seedAttachment(testDb, {
      id: "att-1",
      ticketKey: "VPL-1",
      filename: "screenshot.png",
      mimeType: "image/png",
      jiraUrl: "https://test.atlassian.net/rest/attachment/123",
    });

    const fakeBody = new ReadableStream();
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(fakeBody, { status: 200 }),
    );

    const res = await GET(getRequest("att-1"), makeParams("att-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toContain("screenshot.png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  it("returns 502 when upstream fetch throws", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "T1", status: "TO DO" }).run();
    seedAttachment(testDb, {
      id: "att-1",
      ticketKey: "VPL-1",
      jiraUrl: "https://test.atlassian.net/rest/attachment/123",
    });

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const res = await GET(getRequest("att-1"), makeParams("att-1"));
    expect(res.status).toBe(502);
  });

  it("returns upstream status code when Jira returns non-ok", async () => {
    testDb.insert(ticket).values({ jiraKey: "VPL-1", title: "T1", status: "TO DO" }).run();
    seedAttachment(testDb, {
      id: "att-1",
      ticketKey: "VPL-1",
      jiraUrl: "https://test.atlassian.net/rest/attachment/123",
    });

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));

    const res = await GET(getRequest("att-1"), makeParams("att-1"));
    expect(res.status).toBe(403);
  });
});
