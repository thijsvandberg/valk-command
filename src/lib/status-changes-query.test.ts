// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketStatusChange, ticketScopeChange, jiraComment, storyVersion, ticketSubtask, pipelineRun, ticketMetadata } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { listUnseenStatusChanges, deploySeenKey } from "./status-changes-query";
import { markStatusChangeSeen, bulkMarkStatusChangesSeen } from "./status-change-seen-store";

const NOW = Date.parse("2026-06-27T12:00:00.000Z");
const CTX = { userId: "user-1", jiraName: "Robin Banffer" };

function addTicket(key: string, overrides: Partial<typeof ticket.$inferInsert> = {}) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: `Title ${key}`,
    status: "IN PROGRESS",
    assignee: "Dan Mol",
    assigneeAccountId: "acc-dan",
    ...overrides,
  }).run();
}

function addChange(id: string, key: string, to: string, changedAt: string, sprintName = "S1", overrides: Partial<typeof ticketStatusChange.$inferInsert> = {}) {
  testDb.insert(ticketStatusChange).values({
    id,
    ticketKey: key,
    fromStatus: "IN PROGRESS",
    toStatus: to,
    changedAt,
    sprintName,
    changedBy: "Carol Smit",
    changedByAccountId: "acc-carol",
    changedByAvatar: "carol.png",
    ...overrides,
  }).run();
}

function addScopeChange(id: string, key: string, changedAt: string, overrides: Partial<typeof ticketScopeChange.$inferInsert> = {}) {
  testDb.insert(ticketScopeChange).values({
    id,
    ticketKey: key,
    sprintName: "S1",
    action: "added",
    changedAt,
    changedBy: "Frank van den Nouland",
    changedByAccountId: "acc-frank",
    changedByAvatar: null,
    ...overrides,
  }).run();
}

function addDeploy(id: string, key: string | null, completedAt: string, overrides: Partial<typeof pipelineRun.$inferInsert> = {}) {
  testDb.insert(pipelineRun).values({
    id,
    repo: "valk-app",
    buildNumber: 1,
    branchName: "staging/uat",
    ticketKey: key,
    state: "SUCCESSFUL",
    pipelineUrl: "https://bitbucket.org/x/pipelines/1",
    isDeployment: true,
    environment: "UAT3",
    environmentType: "Staging",
    completedAt,
    ...overrides,
  }).run();
}

describe("listUnseenStatusChanges (BRDG-414)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("lists unseen changes scoped to the given ticket keys, latest per ticket", async () => {
    addTicket("VPL-1", { status: "DONE" });
    addTicket("VPL-2", { status: "TEST" });
    addTicket("VPL-3", { status: "TEST" });
    addChange("sc-1a", "VPL-1", "TEST", "2026-06-27T09:00:00.000Z"); // superseded (not current status)
    addChange("sc-1b", "VPL-1", "DONE", "2026-06-27T10:00:00.000Z"); // matches current status
    addChange("sc-2", "VPL-2", "TEST", "2026-06-27T08:00:00.000Z");
    addChange("sc-3", "VPL-3", "TEST", "2026-06-27T08:00:00.000Z"); // not in the scope keys

    const rows = await listUnseenStatusChanges(CTX, ["VPL-1", "VPL-2"], NOW);

    expect(rows.map((r) => r.ticketKey).sort()).toEqual(["VPL-1", "VPL-2"]);
    // VPL-1 shows its latest change only.
    const v1 = rows.find((r) => r.ticketKey === "VPL-1");
    expect(v1?.id).toBe("sc-1b");
    expect(v1?.toStatus).toBe("DONE");
    expect(v1?.changedBy).toBe("Carol Smit");
    expect(v1?.assignee?.name).toBe("Dan Mol");
  });

  it("hides a change once seen, but a later transition into the same status re-surfaces", async () => {
    // Test -> In Progress -> Test: each landing on TEST is its own item.
    addTicket("VPL-1", { status: "TEST" });
    addChange("sc-old", "VPL-1", "TEST", "2026-06-27T09:00:00.000Z");

    await markStatusChangeSeen(CTX.userId, "sc-old", true);
    expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);

    // The ticket lands on TEST again — a new id, so it surfaces despite the earlier "seen".
    addChange("sc-new", "VPL-1", "TEST", "2026-06-27T11:00:00.000Z");
    const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("sc-new");
  });

  it("bulk mark-all-seen clears the queue", async () => {
    addTicket("VPL-1", { status: "TEST" });
    addTicket("VPL-2", { status: "DONE" });
    addChange("sc-1", "VPL-1", "TEST", "2026-06-27T09:00:00.000Z");
    addChange("sc-2", "VPL-2", "DONE", "2026-06-27T09:00:00.000Z");

    await bulkMarkStatusChangesSeen(CTX.userId, ["sc-1", "sc-2"]);
    expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
  });

  it("flags open subtasks for a Done change", async () => {
    addTicket("VPL-1", { status: "DONE" });
    addChange("sc-1", "VPL-1", "DONE", "2026-06-27T09:00:00.000Z");
    testDb.insert(ticketSubtask).values([
      { id: "st-1", ticketKey: "VPL-1", subtaskKey: "VPL-9", title: "a", status: "IN PROGRESS" },
      { id: "st-2", ticketKey: "VPL-1", subtaskKey: "VPL-10", title: "b", status: "DONE" },
    ]).run();

    const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
    expect(rows[0].openSubtaskCount).toBe(1);
    expect(rows[0].totalSubtaskCount).toBe(2);
  });

  describe("what's-new (24h, not me)", () => {
    it("counts only comments in the last 24h that are not mine", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addChange("sc-1", "VPL-1", "TEST", "2026-06-27T09:00:00.000Z");
      testDb.insert(jiraComment).values([
        { id: "c1", ticketKey: "VPL-1", jiraCommentId: "j1", authorName: "Carol Smit", content: "x", createdAt: "2026-06-27T08:00:00.000Z" }, // recent, not me
        { id: "c2", ticketKey: "VPL-1", jiraCommentId: "j2", authorName: "Bob", content: "y", createdAt: "2026-06-27T09:30:00.000Z" }, // recent, not me
        { id: "c3", ticketKey: "VPL-1", jiraCommentId: "j3", authorName: "Robin Banffer", content: "z", createdAt: "2026-06-27T10:00:00.000Z" }, // mine -> excluded
        { id: "c4", ticketKey: "VPL-1", jiraCommentId: "j4", authorName: "Carol Smit", content: "old", createdAt: "2026-06-25T08:00:00.000Z" }, // >24h -> excluded
      ]).run();

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows[0].newCommentCount).toBe(2);
      expect(rows[0].lastCommentAt).toBe("2026-06-27T09:30:00.000Z");
    });

    it("flags a recent story edit by someone else, ignoring my own and old edits (SQLite-format timestamps)", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addChange("sc-1", "VPL-1", "TEST", "2026-06-27T09:00:00.000Z");
      // storyVersion.createdAt uses the SQLite default format ("YYYY-MM-DD HH:MM:SS", UTC).
      testDb.insert(storyVersion).values([
        { id: "v1", jiraKey: "VPL-1", description: "d", contentHash: "h1", updatedBy: "Carol Smit", createdAt: "2026-06-27 06:00:00" }, // recent, not me
        { id: "v2", jiraKey: "VPL-1", description: "d", contentHash: "h2", updatedBy: "Robin Banffer", createdAt: "2026-06-27 07:00:00" }, // mine -> excluded
        { id: "v3", jiraKey: "VPL-1", description: "d", contentHash: "h3", updatedBy: "Carol Smit", createdAt: "2026-06-24 06:00:00" }, // >24h -> excluded
      ]).run();

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows[0].storyEditedAt).toBe("2026-06-27 06:00:00");
    });
  });

  describe("sprint-add lines (BRDG-439)", () => {
    it("surfaces a sprint-add-only ticket (no status change) with the mover's name", async () => {
      addTicket("VPL-1", { status: "TO DO", sprintName: "S1" });
      addScopeChange("scope-VPL-1-add-1", "VPL-1", "2026-06-27T10:00:00.000Z");

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBeNull();
      expect(rows[0].toStatus).toBeNull();
      expect(rows[0].sprintAdded?.id).toBe("scope-VPL-1-add-1");
      expect(rows[0].sprintAdded?.changedBy).toBe("Frank van den Nouland");
      expect(rows[0].assignee?.name).toBe("Dan Mol");
    });

    it("combines a sprint-add with a status change on the same ticket into one item", async () => {
      addTicket("VPL-1", { status: "IN PROGRESS", sprintName: "S1" });
      addChange("sc-1", "VPL-1", "IN PROGRESS", "2026-06-27T10:00:00.000Z");
      addScopeChange("scope-VPL-1-add-1", "VPL-1", "2026-06-27T10:00:00.000Z");

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("sc-1");
      expect(rows[0].toStatus).toBe("IN PROGRESS");
      expect(rows[0].sprintAdded?.id).toBe("scope-VPL-1-add-1");
    });

    it("ignores actor-less backfill rows (synthetic / burnup) and 'removed' rows", async () => {
      addTicket("VPL-1", { status: "TO DO", sprintName: "S1" });
      addTicket("VPL-2", { status: "TO DO", sprintName: "S1" });
      addScopeChange("scope-VPL-1-add-synthetic", "VPL-1", "2026-06-20T10:00:00.000Z", {
        changedBy: null,
        changedByAccountId: null,
        changedByAvatar: null,
      });
      addScopeChange("scope-VPL-2-rm-1", "VPL-2", "2026-06-27T10:00:00.000Z", { action: "removed" });

      expect(await listUnseenStatusChanges(CTX, ["VPL-1", "VPL-2"], NOW)).toHaveLength(0);
    });

    it("hides the sprint-add once seen", async () => {
      addTicket("VPL-1", { status: "TO DO", sprintName: "S1" });
      addScopeChange("scope-VPL-1-add-1", "VPL-1", "2026-06-27T10:00:00.000Z");

      await markStatusChangeSeen(CTX.userId, "scope-VPL-1-add-1", true);
      expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
    });

    it("hides the sprint-add once the ticket has left the sprint", async () => {
      addTicket("VPL-1", { status: "TO DO", sprintName: "" });
      addScopeChange("scope-VPL-1-add-1", "VPL-1", "2026-06-27T10:00:00.000Z");

      expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
    });
  });

  describe("UAT deploy lines (BRDG-446)", () => {
    it("surfaces a fresh UAT deploy as a deploy-only line for an in-flight ticket with no status change", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addDeploy("run-1", "VPL-1", "2026-06-27T09:00:00.000Z");

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBeNull();
      expect(rows[0].toStatus).toBeNull();
      expect(rows[0].deployAdded?.id).toBe(deploySeenKey("VPL-1", "run-1"));
      expect(rows[0].deployAdded?.environment).toBe("UAT3");
      expect(rows[0].deployAdded?.state).toBe("SUCCESSFUL");
      expect(rows[0].deployAdded?.completedAt).toBe("2026-06-27T09:00:00.000Z");
    });

    it("folds a fresh UAT deploy into a status-change line for the same ticket (one combined line)", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addChange("sc-1", "VPL-1", "TEST", "2026-06-27T10:00:00.000Z");
      addDeploy("run-1", "VPL-1", "2026-06-27T09:00:00.000Z");

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("sc-1");
      expect(rows[0].toStatus).toBe("TEST");
      expect(rows[0].deployAdded?.id).toBe(deploySeenKey("VPL-1", "run-1"));
    });

    it("ignores Production and Test deploys (only Staging/UAT surfaces)", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addTicket("VPL-2", { status: "TEST" });
      addDeploy("run-prod", "VPL-1", "2026-06-27T09:00:00.000Z", { environment: "Production", environmentType: "Production" });
      addDeploy("run-test", "VPL-2", "2026-06-27T09:00:00.000Z", { environment: "Test", environmentType: "Test" });

      expect(await listUnseenStatusChanges(CTX, ["VPL-1", "VPL-2"], NOW)).toHaveLength(0);
    });

    it("does not surface a UAT deploy for a ticket that is not in flight (Done / To Do)", async () => {
      addTicket("VPL-1", { status: "DONE" });
      addTicket("VPL-2", { status: "TO DO" });
      addDeploy("run-1", "VPL-1", "2026-06-27T09:00:00.000Z");
      addDeploy("run-2", "VPL-2", "2026-06-27T09:00:00.000Z");

      expect(await listUnseenStatusChanges(CTX, ["VPL-1", "VPL-2"], NOW)).toHaveLength(0);
    });

    it("does not surface a UAT deploy outside the 24h recency window", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addDeploy("run-old", "VPL-1", "2026-06-25T09:00:00.000Z");

      expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
    });

    it("does not surface a FAILED UAT deploy", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addDeploy("run-fail", "VPL-1", "2026-06-27T09:00:00.000Z", { state: "FAILED" });

      expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
    });

    it("fans a multi-ticket UAT deploy out to each in-scope in-flight ticket, excluding off-scope keys", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addTicket("VPL-2", { status: "IN PROGRESS" });
      addTicket("VPL-3", { status: "TEST" });
      addDeploy("run-1", "VPL-1", "2026-06-27T09:00:00.000Z", { ticketKeys: JSON.stringify(["VPL-1", "VPL-2", "VPL-3"]) });

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1", "VPL-2"], NOW);
      expect(rows.map((r) => r.ticketKey).sort()).toEqual(["VPL-1", "VPL-2"]);
      expect(rows.find((r) => r.ticketKey === "VPL-1")?.deployAdded?.id).toBe(deploySeenKey("VPL-1", "run-1"));
      expect(rows.find((r) => r.ticketKey === "VPL-2")?.deployAdded?.id).toBe(deploySeenKey("VPL-2", "run-1"));
    });

    it("hides a deploy-only line once its synthesized seen-key is marked seen", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addDeploy("run-1", "VPL-1", "2026-06-27T09:00:00.000Z");

      await markStatusChangeSeen(CTX.userId, deploySeenKey("VPL-1", "run-1"), true);
      expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
    });

    it("marking the deploy seen drops only the deploy reason, leaving the status change for the same ticket", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addChange("sc-1", "VPL-1", "TEST", "2026-06-27T10:00:00.000Z");
      addDeploy("run-1", "VPL-1", "2026-06-27T09:00:00.000Z");

      let rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].deployAdded?.id).toBe(deploySeenKey("VPL-1", "run-1"));

      await markStatusChangeSeen(CTX.userId, deploySeenKey("VPL-1", "run-1"), true);
      rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("sc-1");
      expect(rows[0].deployAdded).toBeNull();
    });
  });

  describe("test-doc draft-ready reason (BRDG-471)", () => {
    function addTestDoc(key: string, fields: Partial<typeof ticketMetadata.$inferInsert>) {
      testDb.insert(ticketMetadata).values({ jiraKey: key, ...fields }).run();
    }

    it("surfaces a draft-only ticket as a testDocReady line with no status transition", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addTestDoc("VPL-1", { testDocDraft: "**Doc**", testDocDraftGeneratedAt: "2026-06-27T11:00:00.000Z" });

      const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].testDocReady).toBe(true);
      expect(rows[0].id).toBeNull();
      expect(rows[0].toStatus).toBeNull();
      // Falls back to the draft's generation time so the line is never timeless.
      expect(rows[0].changedAt).toBe("2026-06-27T11:00:00.000Z");
      // BRDG-474: the generation instant is surfaced; a fresh draft is not stale.
      expect(rows[0].testDocGeneratedAt).toBe("2026-06-27T11:00:00.000Z");
      expect(rows[0].testDocStaleStoryAt).toBeNull();
      expect(rows[0].testDocStaleCommentAt).toBeNull();
    });

    it("persists after the status change is dismissed (state-derived, no seen-key)", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addChange("sc-1", "VPL-1", "TEST", "2026-06-27T10:00:00.000Z");
      addTestDoc("VPL-1", { testDocDraft: "**Doc**" });

      // Combined line first: the status change carries the draft flag.
      let rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("sc-1");
      expect(rows[0].testDocReady).toBe(true);

      // Dismiss the status change — the draft-ready line stands alone, undismissed.
      await markStatusChangeSeen(CTX.userId, "sc-1", true);
      rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBeNull();
      expect(rows[0].testDocReady).toBe(true);
    });

    it("drops once the draft is accepted (testDoc set, draft cleared)", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addTestDoc("VPL-1", { testDoc: "**Accepted**" });

      expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
    });

    it("ignores an empty-string draft (matches deriveTestDocState)", async () => {
      addTicket("VPL-1", { status: "TEST" });
      addTestDoc("VPL-1", { testDocDraft: "" });

      expect(await listUnseenStatusChanges(CTX, ["VPL-1"], NOW)).toHaveLength(0);
    });

    describe("staleness — story/comments moved after generation (BRDG-474)", () => {
      it("flags a story edit made after the draft was generated, with who/when for the tooltip", async () => {
        addTicket("VPL-1", { status: "TEST" });
        addTestDoc("VPL-1", { testDocDraft: "**Doc**", testDocDraftGeneratedAt: "2026-06-27T11:00:00.000Z" });
        // An older post-generation edit plus the latest one: the latest supplies who/when.
        testDb.insert(storyVersion).values({ id: "v0", jiraKey: "VPL-1", description: "d", contentHash: "h0", updatedBy: "Old Editor", createdAt: "2026-06-27 11:10:00" }).run();
        testDb.insert(storyVersion).values({ id: "v1", jiraKey: "VPL-1", description: "d", contentHash: "h1", updatedBy: "Carol Smit", createdAt: "2026-06-27 11:30:00" }).run();

        const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
        expect(rows[0].testDocStaleStoryAt).toBe("2026-06-27 11:30:00");
        expect(rows[0].testDocStaleStoryBy).toBe("Carol Smit");
        expect(rows[0].testDocStaleCommentAt).toBeNull();
      });

      it("flags comments made after generation, including the acting user's own (no self-exclusion)", async () => {
        addTicket("VPL-1", { status: "TEST" });
        addTestDoc("VPL-1", { testDocDraft: "**Doc**", testDocDraftGeneratedAt: "2026-06-27T11:00:00.000Z" });
        // Authored by the acting PO (Robin Banffer): still counts — the doc is generated from it.
        testDb.insert(jiraComment).values({ id: "c1", ticketKey: "VPL-1", jiraCommentId: "j1", authorName: "Robin Banffer", content: "x", createdAt: "2026-06-27T11:45:00.000Z" }).run();

        const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
        expect(rows[0].testDocStaleCommentAt).toBe("2026-06-27T11:45:00.000Z");
        expect(rows[0].testDocStaleCommentBy).toBe("Robin Banffer");
        expect(rows[0].testDocStaleStoryAt).toBeNull();
      });

      it("does not flag activity that predates generation", async () => {
        addTicket("VPL-1", { status: "TEST" });
        addTestDoc("VPL-1", { testDocDraft: "**Doc**", testDocDraftGeneratedAt: "2026-06-27T11:00:00.000Z" });
        testDb.insert(storyVersion).values({ id: "v1", jiraKey: "VPL-1", description: "d", contentHash: "h1", updatedBy: "Carol Smit", createdAt: "2026-06-27 10:00:00" }).run();
        testDb.insert(jiraComment).values({ id: "c1", ticketKey: "VPL-1", jiraCommentId: "j1", authorName: "Carol Smit", content: "x", createdAt: "2026-06-27T10:30:00.000Z" }).run();

        const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
        expect(rows[0].testDocStaleStoryAt).toBeNull();
        expect(rows[0].testDocStaleCommentAt).toBeNull();
      });

      it("reports no staleness when the generation instant is unknown (legacy draft)", async () => {
        addTicket("VPL-1", { status: "TEST" });
        addTestDoc("VPL-1", { testDocDraft: "**Doc**" });
        testDb.insert(storyVersion).values({ id: "v1", jiraKey: "VPL-1", description: "d", contentHash: "h1", updatedBy: "Carol Smit", createdAt: "2026-06-27 11:30:00" }).run();

        const rows = await listUnseenStatusChanges(CTX, ["VPL-1"], NOW);
        expect(rows[0].testDocReady).toBe(true);
        expect(rows[0].testDocGeneratedAt).toBeNull();
        expect(rows[0].testDocStaleStoryAt).toBeNull();
        expect(rows[0].testDocStaleCommentAt).toBeNull();
      });
    });
  });
});
