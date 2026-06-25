// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedSprint } from "@/test/builders";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));
vi.mock("server-only", () => ({}));

import { enrichCandidatesWithSprintName } from "./related-candidate-sprint";

describe("enrichCandidatesWithSprintName", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns an empty array unchanged", async () => {
    expect(await enrichCandidatesWithSprintName([])).toEqual([]);
  });

  it("resolves the sprint name from the candidate's ticket via the cache", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", sprintName: "555" });
    seedSprint(testDb, { sprintId: "555", displayName: "BT: 139" });

    const out = await enrichCandidatesWithSprintName([{ jiraKey: "VPL-100", score: 80 }]);
    expect(out).toEqual([{ jiraKey: "VPL-100", score: 80, sprintName: "BT: 139" }]);
  });

  it("returns null when the candidate's ticket is not synced locally", async () => {
    const out = await enrichCandidatesWithSprintName([{ jiraKey: "VPL-404" }]);
    expect(out[0].sprintName).toBeNull();
  });

  it("returns null when the sprint id has no cache entry", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", sprintName: "999" });
    const out = await enrichCandidatesWithSprintName([{ jiraKey: "VPL-100" }]);
    expect(out[0].sprintName).toBeNull();
  });

  it("treats an empty sprint (backlog) as null", async () => {
    seedTicket(testDb, { jiraKey: "VPL-100", sprintName: "" });
    const out = await enrichCandidatesWithSprintName([{ jiraKey: "VPL-100" }]);
    expect(out[0].sprintName).toBeNull();
  });
});
