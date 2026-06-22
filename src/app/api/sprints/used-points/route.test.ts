// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { seedTicket, seedTicketMetadata } from "@/test/builders";
import { placeholderTicket } from "@/db/schema";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

async function getMap() {
  const rows = (await (await GET()).json()) as { sprintId: string; used: number }[];
  return Object.fromEntries(rows.map((r) => [r.sprintId, r.used]));
}

describe("GET /api/sprints/used-points", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("sums real story points per sprint via primary sprint name", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "5895", storyPoints: 3 });
    seedTicket(testDb, { jiraKey: "VPL-2", sprintName: "5895", storyPoints: 5 });
    seedTicket(testDb, { jiraKey: "VPL-3", sprintName: "5896", storyPoints: 8 });

    expect(await getMap()).toEqual({ "5895": 8, "5896": 8 });
  });

  it("uses the guestimation when there is no real SP (effective points)", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "5895", storyPoints: null });
    seedTicketMetadata(testDb, { jiraKey: "VPL-1", guestimation: 5 });
    seedTicket(testDb, { jiraKey: "VPL-2", sprintName: "5895", storyPoints: 2 });

    expect(await getMap()).toEqual({ "5895": 7 });
  });

  it("counts a ticket toward every sprint in its sprint_ids array", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "5895", sprintIds: JSON.stringify(["5895", "5896"]), storyPoints: 3 });

    expect(await getMap()).toEqual({ "5895": 3, "5896": 3 });
  });

  it("excludes drafts and backlog (empty sprint) tickets", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "5895", storyPoints: 3 });
    seedTicket(testDb, { jiraKey: "VPL-2", sprintName: "", storyPoints: 5 });
    seedTicket(testDb, { jiraKey: "VPL-3", sprintName: "5895", status: "DRAFTING", storyPoints: 8 });

    expect(await getMap()).toEqual({ "5895": 3 });
  });

  it("excludes soft-deleted (removed-from-Jira) tickets", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "5895", storyPoints: 3 });
    seedTicket(testDb, { jiraKey: "VPL-2", sprintName: "5895", storyPoints: 5, removedFromJiraAt: "2026-06-20T00:00:00Z" });

    expect(await getMap()).toEqual({ "5895": 3 });
  });

  // Forward-planning placeholders (BRDG-304) count via their guestimation.
  it("counts an active placeholder's guestimation toward its sprint", async () => {
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "5895", storyPoints: 2 });
    testDb.insert(placeholderTicket).values({ id: "PLH-1", title: "ph", sprintId: "5895", guestimation: 3, status: "active" }).run();

    expect(await getMap()).toEqual({ "5895": 5 });
  });

  it("ignores promoted placeholders and zero/no-sprint ones", async () => {
    testDb.insert(placeholderTicket).values({ id: "PLH-1", title: "promoted", sprintId: "5895", guestimation: 3, status: "promoted", promotedToKey: "VPL-9" }).run();
    testDb.insert(placeholderTicket).values({ id: "PLH-2", title: "no sprint", sprintId: null, guestimation: 5, status: "active" }).run();
    testDb.insert(placeholderTicket).values({ id: "PLH-3", title: "na", sprintId: "5895", guestimation: 0, status: "active" }).run();

    expect(await getMap()).toEqual({});
  });
});
