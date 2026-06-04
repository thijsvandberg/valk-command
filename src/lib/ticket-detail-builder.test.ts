import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket } from "@/test/builders";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/jira-client", () => ({ jiraClient: { getIssue: vi.fn() } }));

import { buildAssignee, attachmentColor, resolveAttachmentRefs, buildTicketDetail } from "./ticket-detail-builder";

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
