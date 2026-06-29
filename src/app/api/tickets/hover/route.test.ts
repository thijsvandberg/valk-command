// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, ticketSubtask, sprintNameCache } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

function seedTicket(
  db: BetterSQLite3Database<typeof schema>,
  key: string,
  overrides: Partial<typeof ticket.$inferInsert> = {},
) {
  db.insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
      type: "story",
      ...overrides,
    })
    .run();
}

function hoverRequest(keys: string) {
  return new Request(`http://localhost:3100/api/tickets/hover?keys=${encodeURIComponent(keys)}`);
}

describe("GET /api/tickets/hover (BRDG-412)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns the hover shape keyed by ticket key for the requested keys", async () => {
    seedTicket(testDb, "VPL-1");
    testDb.insert(ticketMetadata).values({
      jiraKey: "VPL-1",
      readiness: "ready_for_refinement",
      qualityScore: 77,
      businessValue: 8,
      poNotes: "a note",
    }).run();

    const res = await GET(hoverRequest("VPL-1"));
    const data = await res.json();

    expect(Object.keys(data)).toEqual(["VPL-1"]);
    expect(data["VPL-1"].title).toBe("Ticket VPL-1");
    expect(data["VPL-1"].readiness).toBe("ready_for_refinement");
    expect(data["VPL-1"].qualityScore).toBe(77);
    expect(data["VPL-1"].businessValue).toBe(8);
    expect(data["VPL-1"].notes).toBe("a note");
  });

  it("returns only hover fields, never detail or non-hover summary fields", async () => {
    seedTicket(testDb, "VPL-1");

    const res = await GET(hoverRequest("VPL-1"));
    const data = await res.json();
    const card = data["VPL-1"];

    // No heavy detail payload (the list-vs-detail split, BRDG-387).
    for (const heavy of ["description", "jiraComments", "comments", "attachments", "subtasks"]) {
      expect(card).not.toHaveProperty(heavy);
    }
    // Strictly the hover subset: no summary-only fields the card never shows.
    // (type/jiraStatus are now included so the list-variant pill can paint its
    // type icon and status segment from this payload, BRDG-265 follow-up.)
    for (const nonHover of ["key", "poStatus", "jiraRank", "sprintIds"]) {
      expect(card).not.toHaveProperty(nonHover);
    }
    // The hover fields are present.
    for (const field of ["title", "type", "jiraStatus", "storyPoints", "businessValue", "sprintId", "sprintName", "readiness", "qualityScore", "notes", "editState"]) {
      expect(card).toHaveProperty(field);
    }
  });

  it("is bounded to the requested keys (ignores other tickets)", async () => {
    seedTicket(testDb, "VPL-1");
    seedTicket(testDb, "VPL-2");
    seedTicket(testDb, "VPL-3");

    const res = await GET(hoverRequest("VPL-1,VPL-3"));
    const data = await res.json();

    expect(Object.keys(data).sort()).toEqual(["VPL-1", "VPL-3"]);
  });

  it("excludes subtasks and epics (no card, matching the old list feed)", async () => {
    seedTicket(testDb, "VPL-1", { type: "story" });
    seedTicket(testDb, "VPL-SUB", { type: "subtask" });
    seedTicket(testDb, "VPL-EPIC", { type: "epic" });

    const res = await GET(hoverRequest("VPL-1,VPL-SUB,VPL-EPIC"));
    const data = await res.json();

    expect(Object.keys(data)).toEqual(["VPL-1"]);
  });

  it("excludes draft/replaced/failed statuses", async () => {
    seedTicket(testDb, "VPL-1", { status: "TO DO" });
    seedTicket(testDb, "VPL-DRAFT", { status: "DRAFTING" });
    seedTicket(testDb, "VPL-REPLACED", { status: "REPLACED" });

    const res = await GET(hoverRequest("VPL-1,VPL-DRAFT,VPL-REPLACED"));
    const data = await res.json();

    expect(Object.keys(data)).toEqual(["VPL-1"]);
  });

  it("resolves sprintName from the sprint name cache", async () => {
    seedTicket(testDb, "VPL-1", { sprintName: "4238" });
    testDb.insert(sprintNameCache).values({ sprintId: "4238", displayName: "BT: 142" }).run();

    const res = await GET(hoverRequest("VPL-1"));
    const data = await res.json();

    expect(data["VPL-1"].sprintId).toBe("4238");
    expect(data["VPL-1"].sprintName).toBe("BT: 142");
  });

  it("derives open/total subtask counts", async () => {
    seedTicket(testDb, "VPL-1");
    testDb.insert(ticketSubtask).values([
      { id: "s1", ticketKey: "VPL-1", subtaskKey: "VPL-1-1", title: "a", status: "TO DO" },
      { id: "s2", ticketKey: "VPL-1", subtaskKey: "VPL-1-2", title: "b", status: "DONE" },
      { id: "s3", ticketKey: "VPL-1", subtaskKey: "VPL-1-3", title: "c", status: "DEPRECATED" },
    ]).run();

    const res = await GET(hoverRequest("VPL-1"));
    const data = await res.json();

    expect(data["VPL-1"].totalSubtaskCount).toBe(3);
    expect(data["VPL-1"].openSubtaskCount).toBe(1);
  });

  it("returns an empty object when no keys are given", async () => {
    const res = await GET(hoverRequest(""));
    const data = await res.json();
    expect(data).toEqual({});
  });
});
