// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketLink, poComment, jiraComment, sprintNameCache } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

function seedTicket(key: string, overrides: Partial<typeof ticket.$inferInsert> = {}) {
  testDb
    .insert(ticket)
    .values({ jiraKey: key, title: `Ticket ${key}`, status: "TO DO", type: "story", ...overrides })
    .run();
}

function get(key: string) {
  return GET(new Request(`http://localhost:3100/api/tickets/${key}/referenced-issues`), {
    params: Promise.resolve({ key }),
  });
}

describe("GET /api/tickets/[key]/referenced-issues", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns a key mentioned in the description", async () => {
    seedTicket("VPL-1", { description: "This relates to VPL-100 in scope." });
    seedTicket("VPL-100");

    const res = await get("VPL-1");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results.map((r: { key: string }) => r.key)).toEqual(["VPL-100"]);
  });

  it("sets a private, no-store cache header", async () => {
    seedTicket("VPL-1");
    const res = await get("VPL-1");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("surfaces keys mentioned only in a Jira comment or a PO comment", async () => {
    seedTicket("VPL-1", { description: "no mentions here" });
    seedTicket("VPL-200");
    seedTicket("VPL-300");
    testDb.insert(jiraComment).values({
      id: "jc1",
      ticketKey: "VPL-1",
      authorName: "Dev",
      content: "Tracked under VPL-200",
    }).run();
    testDb.insert(poComment).values({
      id: "pc1",
      ticketKey: "VPL-1",
      content: "Also see VPL-300",
    }).run();

    const data = await (await get("VPL-1")).json();
    expect(data.results.map((r: { key: string }) => r.key).sort()).toEqual(["VPL-200", "VPL-300"]);
  });

  it("detects a key inside a Jira browse URL", async () => {
    seedTicket("VPL-1", {
      description: "https://new-story.atlassian.net/browse/VPL-100 is the parent",
    });
    seedTicket("VPL-100");

    const data = await (await get("VPL-1")).json();
    expect(data.results.map((r: { key: string }) => r.key)).toEqual(["VPL-100"]);
  });

  it("excludes a key that is already formally linked", async () => {
    seedTicket("VPL-1", { description: "Mentions VPL-100 and VPL-400" });
    seedTicket("VPL-100");
    seedTicket("VPL-400");
    testDb.insert(ticketLink).values({
      id: "l1",
      ticketKey: "VPL-1",
      relation: "relates to",
      linkedKey: "VPL-400",
      title: "Ticket VPL-400",
      status: "TO DO",
    }).run();

    const data = await (await get("VPL-1")).json();
    expect(data.results.map((r: { key: string }) => r.key)).toEqual(["VPL-100"]);
  });

  it("never includes the ticket's own key", async () => {
    seedTicket("VPL-1", { description: "Self-reference VPL-1 and real VPL-100" });
    seedTicket("VPL-100");

    const data = await (await get("VPL-1")).json();
    expect(data.results.map((r: { key: string }) => r.key)).toEqual(["VPL-100"]);
  });

  it("drops mentioned keys with no known local ticket", async () => {
    seedTicket("VPL-1", { description: "Mentions VPL-100 and unsynced VPL-999" });
    seedTicket("VPL-100");

    const data = await (await get("VPL-1")).json();
    expect(data.results.map((r: { key: string }) => r.key)).toEqual(["VPL-100"]);
  });

  it("returns the full LinkSearchResult shape, resolving the sprint display name", async () => {
    seedTicket("VPL-1", { description: "See VPL-100" });
    seedTicket("VPL-100", {
      type: "bug",
      status: "IN PROGRESS",
      sprintName: "4238",
      epicKey: "VPL-9",
      assignee: "Alex",
      jiraUpdatedAt: "2026-06-01T00:00:00.000Z",
    });
    testDb.insert(sprintNameCache).values({ sprintId: "4238", displayName: "BT: 142" }).run();

    const data = await (await get("VPL-1")).json();
    expect(data.results[0]).toEqual({
      key: "VPL-100",
      title: "Ticket VPL-100",
      type: "bug",
      status: "IN PROGRESS",
      sprintName: "BT: 142",
      epicKey: "VPL-9",
      assignee: "Alex",
      jiraUpdatedAt: "2026-06-01T00:00:00.000Z",
      project: "VPL",
      source: "local",
    });
  });

  it("returns an empty list when the ticket has no resolvable references", async () => {
    seedTicket("VPL-1", { description: "Just prose, no keys." });
    const data = await (await get("VPL-1")).json();
    expect(data.results).toEqual([]);
  });

  it("returns an empty list for an unknown source ticket", async () => {
    const data = await (await get("VPL-404")).json();
    expect(data.results).toEqual([]);
  });
});
