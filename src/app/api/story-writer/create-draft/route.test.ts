// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";
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

vi.mock("@/lib/draft-sync", () => ({
  syncDraftToJira: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";
import { syncDraftToJira } from "@/lib/draft-sync";

const BASE = "http://localhost:3100/api/story-writer/create-draft";

describe("POST /api/story-writer/create-draft", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("creates draft with placeholder title when title is empty", async () => {
    const res = await POST(new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Untitled draft");
    expect(data.needsTitle).toBe(true);
    expect(data.key).toMatch(/^DRAFT-/);

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, data.key)).get();
    expect(t!.title).toBe("Untitled draft");
  });

  it("returns needsTitle false when title is provided", async () => {
    const res = await POST(new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Real title" }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.needsTitle).toBe(false);
    expect(data.title).toBe("Real title");
  });

  it("creates a draft ticket and returns the draft key", async () => {
    const res = await POST(new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "My new story", issueType: "bug" }),
    }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.key).toMatch(/^DRAFT-/);
    expect(data.title).toBe("My new story");
    expect(data.issueType).toBe("bug");

    // Verify DB records
    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, data.key)).get();
    expect(t).toBeDefined();
    expect(t!.status).toBe("DRAFTING");
    expect(t!.title).toBe("My new story");
    expect(t!.type).toBe("bug");

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, data.key)).get();
    expect(meta).toBeDefined();
    expect(meta!.readiness).toBe("drafting");
  });

  it("fires background Jira sync", async () => {
    const res = await POST(new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Sync test", sprintId: "42" }),
    }));

    const data = await res.json();
    expect(syncDraftToJira).toHaveBeenCalledWith(
      data.key,
      { title: "Sync test", sprintId: "42", issueType: "story" },
    );
  });
});
