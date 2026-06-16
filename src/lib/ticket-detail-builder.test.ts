import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedTicketMetadata } from "@/test/builders";
import { ticketLocalEdit, storyVersion } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/jira-client", () => ({
  jiraClient: { getIssue: vi.fn(), updateIssue: vi.fn().mockResolvedValue(undefined) },
  STORY_POINTS_FIELD: "customfield_sp",
  FLAGGED_FIELD: "customfield_flag",
  extractSprint: vi.fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sync-jira-timestamp", () => ({ syncJiraTimestamp: vi.fn().mockResolvedValue(undefined) }));

import { buildAssignee, attachmentColor, resolveAttachmentRefs, buildTicketDetail, updateTicketFields } from "./ticket-detail-builder";

describe("buildTicketDetail epic children ordering", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns epic children sorted by jiraRank and exposes the rank", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", title: "Epic", type: "epic" });
    // Seeded out of rank order to prove the query sorts, not insertion order.
    seedTicket(testDb, { jiraKey: "VPL-30", title: "Third", epicKey: "VPL-1", jiraRank: 2 });
    seedTicket(testDb, { jiraKey: "VPL-10", title: "First", epicKey: "VPL-1", jiraRank: 0 });
    seedTicket(testDb, { jiraKey: "VPL-20", title: "Second", epicKey: "VPL-1", jiraRank: 1 });

    const built = await buildTicketDetail("VPL-1");
    expect(built).not.toBeNull();
    const children = built!.data.epicChildren;
    expect(children.map((c) => c.key)).toEqual(["VPL-10", "VPL-20", "VPL-30"]);
    expect(children.map((c) => c.jiraRank)).toEqual([0, 1, 2]);
  });

  it("sorts unranked children last with a deterministic key tiebreaker", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", title: "Epic", type: "epic" });
    seedTicket(testDb, { jiraKey: "VPL-40", title: "Unranked B", epicKey: "VPL-1", jiraRank: null });
    seedTicket(testDb, { jiraKey: "VPL-11", title: "Ranked", epicKey: "VPL-1", jiraRank: 5 });
    seedTicket(testDb, { jiraKey: "VPL-39", title: "Unranked A", epicKey: "VPL-1", jiraRank: null });

    const built = await buildTicketDetail("VPL-1");
    const children = built!.data.epicChildren;
    expect(children.map((c) => c.key)).toEqual(["VPL-11", "VPL-39", "VPL-40"]);
    expect(children.map((c) => c.jiraRank)).toEqual([5, null, null]);
  });

  it("surfaces a child's pending local title edit instead of the synced Jira title", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", title: "Epic", type: "epic" });
    seedTicket(testDb, { jiraKey: "VPL-10", title: "Synced title", epicKey: "VPL-1", jiraRank: 0 });
    seedTicket(testDb, { jiraKey: "VPL-20", title: "Untouched title", epicKey: "VPL-1", jiraRank: 1 });
    testDb.insert(ticketLocalEdit).values({
      id: "edit-1",
      ticketKey: "VPL-10",
      field: "title",
      localValue: "Locally edited title",
    }).run();

    const built = await buildTicketDetail("VPL-1");
    const children = built!.data.epicChildren;
    expect(children.find((c) => c.key === "VPL-10")?.title).toBe("Locally edited title");
    expect(children.find((c) => c.key === "VPL-20")?.title).toBe("Untouched title");
  });

  it("computes editState per child so the epic list can show the local-changes dot", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", title: "Epic", type: "epic" });
    seedTicket(testDb, { jiraKey: "VPL-10", title: "Edited", epicKey: "VPL-1", jiraRank: 0 });
    seedTicket(testDb, { jiraKey: "VPL-20", title: "Clean", epicKey: "VPL-1", jiraRank: 1 });
    // A pending edit on a base version that matches the (absent) latest mirror is "local_edits".
    testDb.insert(ticketLocalEdit).values({
      id: "edit-1",
      ticketKey: "VPL-10",
      field: "description",
      localValue: "local body",
      baseJiraVersion: null,
    }).run();

    const built = await buildTicketDetail("VPL-1");
    const children = built!.data.epicChildren;
    expect(children.find((c) => c.key === "VPL-10")?.editState).toBe("local_edits");
    expect(children.find((c) => c.key === "VPL-20")?.editState).toBe("clean");
  });

  it("marks a child conflicted when its local edit is based on a stale mirror version", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", title: "Epic", type: "epic" });
    seedTicket(testDb, { jiraKey: "VPL-10", title: "Stale edit", epicKey: "VPL-1", jiraRank: 0 });
    testDb.insert(storyVersion).values({
      id: "ver-1",
      jiraKey: "VPL-10",
      description: "latest",
      contentHash: "new-hash",
    }).run();
    testDb.insert(ticketLocalEdit).values({
      id: "edit-1",
      ticketKey: "VPL-10",
      field: "description",
      localValue: "local body",
      baseJiraVersion: "old-hash",
    }).run();

    const built = await buildTicketDetail("VPL-1");
    expect(built!.data.epicChildren.find((c) => c.key === "VPL-10")?.editState).toBe("conflict");
  });

  it("flags epic children whose sprint is stored as a legacy name (no id) for re-sync", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", title: "Epic", type: "epic" });
    // Numeric id: resolvable by the sprint backfill, not a re-sync candidate.
    seedTicket(testDb, { jiraKey: "VPL-10", title: "By id", epicKey: "VPL-1", jiraRank: 0, sprintName: "5995" });
    // Legacy name and the on-demand placeholder: no id to resolve, need a ticket re-sync.
    seedTicket(testDb, { jiraKey: "VPL-20", title: "By name", epicKey: "VPL-1", jiraRank: 1, sprintName: "VP Sprint 66 Angels" });
    seedTicket(testDb, { jiraKey: "VPL-30", title: "On demand", epicKey: "VPL-1", jiraRank: 2, sprintName: "__on_demand__" });

    const built = await buildTicketDetail("VPL-1");

    expect(built!.unresolvedSprintKeys.sort()).toEqual(["VPL-20", "VPL-30"]);
    expect(built!.data.resyncingSprints).toBe(true);
  });

  it("does not flag a re-sync when every child sprint is a numeric id", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", title: "Epic", type: "epic" });
    seedTicket(testDb, { jiraKey: "VPL-10", title: "A", epicKey: "VPL-1", jiraRank: 0, sprintName: "5995" });
    seedTicket(testDb, { jiraKey: "VPL-20", title: "B", epicKey: "VPL-1", jiraRank: 1, sprintName: "" });

    const built = await buildTicketDetail("VPL-1");

    expect(built!.unresolvedSprintKeys).toEqual([]);
    expect(built!.data.resyncingSprints).toBeUndefined();
  });
});

describe("updateTicketFields story-points readiness transition", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  async function readReadiness(key: string) {
    const row = await testDb.query.ticketMetadata.findFirst({
      where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
    });
    return row?.readiness ?? null;
  }

  it("advances a Ready-to-Refine ticket to Ready-for-Development when story points are set", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", storyPoints: null });
    seedTicketMetadata(testDb, { jiraKey: "VPL-1", readiness: "ready_to_refine" });

    const outcome = await updateTicketFields("VPL-1", { storyPoints: 5 });

    expect("result" in outcome).toBe(true);
    expect((outcome as { result: Record<string, unknown> }).result.readiness).toBeNull();
    expect(await readReadiness("VPL-1")).toBeNull();
  });

  it("treats '-' (story points 0) as an estimate and advances readiness", async () => {
    seedTicket(testDb, { jiraKey: "VPL-2", storyPoints: null });
    seedTicketMetadata(testDb, { jiraKey: "VPL-2", readiness: "ready_to_refine" });

    await updateTicketFields("VPL-2", { storyPoints: 0 });

    expect(await readReadiness("VPL-2")).toBeNull();
  });

  it("leaves other readiness states untouched when story points are set", async () => {
    seedTicket(testDb, { jiraKey: "VPL-3", storyPoints: null });
    seedTicketMetadata(testDb, { jiraKey: "VPL-3", readiness: "drafting" });

    const outcome = await updateTicketFields("VPL-3", { storyPoints: 3 });

    expect((outcome as { result: Record<string, unknown> }).result.readiness).toBeUndefined();
    expect(await readReadiness("VPL-3")).toBe("drafting");
  });

  it("does not change readiness when story points are cleared", async () => {
    seedTicket(testDb, { jiraKey: "VPL-4", storyPoints: 5 });
    seedTicketMetadata(testDb, { jiraKey: "VPL-4", readiness: "ready_to_refine" });

    await updateTicketFields("VPL-4", { storyPoints: null });

    expect(await readReadiness("VPL-4")).toBe("ready_to_refine");
  });
});

describe("updateTicketFields keeps the guestimation as the guesstimate of record when SP is set (BRDG-323)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  async function readGuess(key: string) {
    const row = await testDb.query.ticketMetadata.findFirst({
      where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
    });
    return row?.guestimation ?? null;
  }

  it("keeps the guestimation when a real non-zero story point lands (pencil to ink)", async () => {
    // BRDG-323: SP supersedes the guess for display, but the prior guess is kept
    // so committing it to story points stays revertible ("back to guesstimate").
    seedTicket(testDb, { jiraKey: "VPL-1", storyPoints: null });
    seedTicketMetadata(testDb, { jiraKey: "VPL-1", guestimation: 5 });

    await updateTicketFields("VPL-1", { storyPoints: 3 });

    expect(await readGuess("VPL-1")).toBe(5);
  });

  it("keeps the guestimation when SP is set to 0 (N/A)", async () => {
    seedTicket(testDb, { jiraKey: "VPL-2", storyPoints: null });
    seedTicketMetadata(testDb, { jiraKey: "VPL-2", guestimation: 8 });

    await updateTicketFields("VPL-2", { storyPoints: 0 });

    expect(await readGuess("VPL-2")).toBe(8);
  });

  it("keeps the guestimation when SP is cleared", async () => {
    seedTicket(testDb, { jiraKey: "VPL-3", storyPoints: 5 });
    seedTicketMetadata(testDb, { jiraKey: "VPL-3", guestimation: 2 });

    await updateTicketFields("VPL-3", { storyPoints: null });

    expect(await readGuess("VPL-3")).toBe(2);
  });

  it("does not create a guess where there was no metadata row", async () => {
    seedTicket(testDb, { jiraKey: "VPL-4", storyPoints: null });

    const outcome = await updateTicketFields("VPL-4", { storyPoints: 5 });

    expect("result" in outcome).toBe(true);
    expect(await readGuess("VPL-4")).toBeNull();
  });
});

describe("buildAssignee", () => {
  it("returns null for null name", () => {
    expect(buildAssignee(null)).toBeNull();
  });

  it("builds assignee with initials and color", () => {
    const result = buildAssignee("John Doe");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("John Doe");
    expect(result!.initials).toBe("JD");
    expect(result!.color).toBeTruthy();
  });

  it("handles single-word name", () => {
    const result = buildAssignee("Admin");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Admin");
  });

  it("carries the accountId when provided (BRDG-365)", () => {
    const result = buildAssignee("John Doe", "acc-jd");
    expect(result!.accountId).toBe("acc-jd");
  });

  it("defaults accountId to null when omitted (no name-only regression)", () => {
    expect(buildAssignee("John Doe")!.accountId).toBeNull();
  });
});

describe("attachmentColor", () => {
  it("returns blue for images", () => {
    expect(attachmentColor("image/png")).toBe("#4a90d9");
    expect(attachmentColor("image/jpeg")).toBe("#4a90d9");
  });

  it("returns red for PDFs", () => {
    expect(attachmentColor("application/pdf")).toBe("#e5534b");
  });

  it("returns green for spreadsheets", () => {
    expect(attachmentColor("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("#4aaa60");
  });

  it("returns gray for unknown types", () => {
    expect(attachmentColor("application/octet-stream")).toBe("#94a3b8");
  });
});

describe("resolveAttachmentRefs", () => {
  const filenameToId = new Map([
    ["screenshot.png", "att-1"],
    ["diagram.jpg", "att-2"],
  ]);

  it("resolves markdown attachment refs", () => {
    const input = "See ![screenshot.png](attachment)";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("See ![screenshot.png](/api/attachments/att-1)");
  });

  it("resolves Jira wiki markup refs", () => {
    const input = "!diagram.jpg!";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("![diagram.jpg](/api/attachments/att-2)");
  });

  it("resolves Jira wiki markup with thumbnail option", () => {
    const input = "!screenshot.png|thumbnail!";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("![screenshot.png](/api/attachments/att-1)");
  });

  it("leaves unresolvable refs as attachment placeholder", () => {
    const input = "![unknown.png](attachment)";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe("![unknown.png](attachment)");
  });

  it("handles text with no attachment refs", () => {
    const input = "Just regular text with no images";
    const result = resolveAttachmentRefs(input, filenameToId);
    expect(result).toBe(input);
  });
});
