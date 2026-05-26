// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";
import { POST } from "../../route";
import { ticket, subtaskSuggestion } from "@/db/schema";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createSession(overrides?: object) {
  const req = new Request("http://localhost:3100/api/refinement-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test session", ticketKeys: ["VPL-1", "VPL-2"], ...overrides }),
  });
  const res = await POST(req);
  return res.json();
}

function seedTicket(key: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Title for ${key}`,
    type: "story",
    status: "TO DO",
  }).run();
}

function seedSuggestions(ticketKey: string, count: number) {
  for (let i = 0; i < count; i++) {
    testDb.insert(subtaskSuggestion).values({
      id: randomUUID(),
      ticketKey,
      title: `Subtask ${i}`,
      createdAt: new Date().toISOString(),
    }).run();
  }
}

describe("GET /api/refinement-sessions/[id]/suggestion-counts", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty counts when no suggestions exist", async () => {
    const session = await createSession();
    const response = await GET(new Request("http://localhost"), makeParams(session.id));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.counts).toEqual({});
  });

  it("returns counts per ticket", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    seedSuggestions("VPL-1", 3);
    seedSuggestions("VPL-2", 1);

    const session = await createSession();
    const response = await GET(new Request("http://localhost"), makeParams(session.id));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.counts["VPL-1"]).toBe(3);
    expect(data.counts["VPL-2"]).toBe(1);
  });

  it("only includes tickets from the session", async () => {
    seedTicket("VPL-1");
    seedTicket("VPL-2");
    seedTicket("VPL-99");
    seedSuggestions("VPL-1", 2);
    seedSuggestions("VPL-99", 5);

    const session = await createSession({ ticketKeys: ["VPL-1", "VPL-2"] });
    const response = await GET(new Request("http://localhost"), makeParams(session.id));
    const data = await response.json();

    expect(data.counts["VPL-1"]).toBe(2);
    expect(data.counts["VPL-99"]).toBeUndefined();
  });

  it("returns 404 for unknown session", async () => {
    const response = await GET(new Request("http://localhost"), makeParams("nonexistent"));
    expect(response.status).toBe(404);
  });

  it("returns empty counts for session with no tickets", async () => {
    const session = await createSession({ ticketKeys: [] });
    const response = await GET(new Request("http://localhost"), makeParams(session.id));
    const data = await response.json();

    expect(data.counts).toEqual({});
  });
});
