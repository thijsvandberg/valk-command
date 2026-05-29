// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket } from "@/test/builders";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));

const mockSyncDraftToJira = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/draft-sync", () => ({
  syncDraftToJira: mockSyncDraftToJira,
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/story-writer/retry-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/story-writer/retry-draft", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
    mockSyncDraftToJira.mockResolvedValue(undefined);
  });

  it("returns 400 when draftKey is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when draftKey does not start with DRAFT-", async () => {
    const res = await POST(makeRequest({ draftKey: "VPL-100" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when draft not found in DB", async () => {
    const res = await POST(makeRequest({ draftKey: "DRAFT-missing" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when draft is not in DRAFT_FAILED state", async () => {
    seedTicket(testDb, { jiraKey: "DRAFT-abc", status: "TO DO" });

    const res = await POST(makeRequest({ draftKey: "DRAFT-abc" }));
    expect(res.status).toBe(400);
  });

  it("resets status to DRAFTING and fires background sync", async () => {
    seedTicket(testDb, { jiraKey: "DRAFT-abc", status: "DRAFT_FAILED", title: "My draft", type: "story" });

    const res = await POST(makeRequest({ draftKey: "DRAFT-abc" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("retrying");

    const row = testDb.select().from(ticket).where(eq(ticket.jiraKey, "DRAFT-abc")).get();
    expect(row?.status).toBe("DRAFTING");
    expect(row?.description).toBeNull();

    expect(mockSyncDraftToJira).toHaveBeenCalledWith("DRAFT-abc", expect.objectContaining({
      title: "My draft",
      issueType: "story",
    }));
  });
});
