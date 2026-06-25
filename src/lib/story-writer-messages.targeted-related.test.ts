// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedSprint, seedStoryWriterSession, seedConversation } from "@/test/builders";
import { appSetting } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

const agentFetchMock = vi.fn();
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: (...args: unknown[]) => agentFetchMock(...args),
}));

import { dispatchTargetedRelated, StoryWriterError, FIND_RELATED_MODEL } from "./story-writer-messages";

function seedSprintCache() {
  testDb.insert(appSetting).values({
    key: "jira_sprints",
    value: JSON.stringify([
      { id: 100, name: "BT: 139", state: "active" },
      { id: 101, name: "BT: 138", state: "closed" },
      { id: 102, name: "GXP: 12", state: "future" },
    ]),
  }).run();
}

describe("dispatchTargetedRelated", () => {
  beforeEach(() => {
    testDb = createTestDb();
    agentFetchMock.mockReset();
    agentFetchMock.mockResolvedValue({ ok: true, data: { id: "task-9" } });
  });

  it("throws 404 when there is no active session", async () => {
    await expect(dispatchTargetedRelated({ key: "VPL-1", query: "x", sprint: null }))
      .rejects.toBeInstanceOf(StoryWriterError);
  });

  it("resolves a fuzzy sprint mention and passes the scoping args", async () => {
    seedConversation(testDb, { id: "conv-1" });
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "200" });
    seedStoryWriterSession(testDb, { ticketKey: "VPL-1", conversationId: "conv-1" });
    seedSprint(testDb, { sprintId: "200", displayName: "BT: 141" }); // source ticket's sprint -> BT prefix
    seedSprintCache();

    const result = await dispatchTargetedRelated({ key: "VPL-1", query: "domain resolving", sprint: "139" });

    expect(result).toMatchObject({ taskId: "task-9", sprintId: "100", sprintName: "BT: 139" });
    const body = agentFetchMock.mock.calls[0][1].body;
    expect(body.model).toBe(FIND_RELATED_MODEL);
    expect(body.conversationId).toBe("conv-1");
    expect(body.args).toMatchObject({
      args: "domain resolving",
      key: "VPL-1",
      query: "domain resolving",
      sprintId: "100",
      sprintName: "BT: 139",
    });
  });

  it("searches topic-only when no sprint is mentioned", async () => {
    seedConversation(testDb, { id: "conv-1" });
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "200" });
    seedStoryWriterSession(testDb, { ticketKey: "VPL-1", conversationId: "conv-1" });
    seedSprintCache();

    const result = await dispatchTargetedRelated({ key: "VPL-1", query: "booking link", sprint: null });

    expect(result.sprintId).toBeNull();
    const body = agentFetchMock.mock.calls[0][1].body;
    expect(body.args.query).toBe("booking link");
    expect(body.args.sprintId).toBeUndefined();
  });

  it("searches topic-only when the sprint mention cannot be resolved (cold cache)", async () => {
    seedConversation(testDb, { id: "conv-1" });
    seedTicket(testDb, { jiraKey: "VPL-1", sprintName: "200" });
    seedStoryWriterSession(testDb, { ticketKey: "VPL-1", conversationId: "conv-1" });
    // no sprint cache seeded

    const result = await dispatchTargetedRelated({ key: "VPL-1", query: "x", sprint: "139" });

    expect(result.sprintId).toBeNull();
    const body = agentFetchMock.mock.calls[0][1].body;
    expect(body.args.sprintId).toBeUndefined();
  });
});
