// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import {
  seedTicket,
  seedConversation,
  seedStoryWriterSession,
} from "@/test/builders";
import { ticketConfluenceLink, ticketAttachment } from "@/db/schema";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockAgentFetch = vi.fn();
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}));

vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { buildEpicContext, buildFollowUpContent, sendStoryWriterMessage } from "./story-writer-messages";

function seedEpicWithContext(key: string) {
  seedTicket(testDb, { jiraKey: key, type: "epic", title: "Checkout revamp", description: "Improve checkout" });
  // Children of the epic (filtered by epicKey, excluding epics).
  seedTicket(testDb, { jiraKey: "VPL-201", type: "story", title: "Cart summary", epicKey: key, status: "TO DO" });
  seedTicket(testDb, { jiraKey: "VPL-202", type: "bug", title: "Coupon edge case", epicKey: key, status: "IN PROGRESS" });
  // An unrelated ticket that must NOT appear.
  seedTicket(testDb, { jiraKey: "VPL-999", type: "story", title: "Unrelated", epicKey: "OTHER-1" });

  testDb.insert(ticketConfluenceLink).values({
    id: randomUUID(),
    ticketKey: key,
    pageId: "p1",
    pageTitle: "Checkout spec",
    pageUrl: "https://confluence.example/checkout",
  }).run();

  testDb.insert(ticketAttachment).values({
    id: randomUUID(),
    ticketKey: key,
    filename: "wireframe.png",
    mimeType: "image/png",
    size: 1024,
  }).run();
}

describe("buildEpicContext", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("assembles epic, children, confluence pages, and attachments", async () => {
    seedEpicWithContext("VPL-E1");
    const ctx = await buildEpicContext("VPL-E1");

    expect(ctx).toContain("VPL-E1 - Checkout revamp");
    expect(ctx).toContain("Improve checkout");
    // Children present
    expect(ctx).toContain("VPL-201");
    expect(ctx).toContain("Cart summary");
    expect(ctx).toContain("VPL-202");
    // Unrelated ticket excluded
    expect(ctx).not.toContain("VPL-999");
    // Confluence titles + URLs
    expect(ctx).toContain("Checkout spec");
    expect(ctx).toContain("https://confluence.example/checkout");
    // Attachment filenames + types
    expect(ctx).toContain("wireframe.png");
    expect(ctx).toContain("image/png");
  });

  it("handles a near-empty epic with no children", async () => {
    seedTicket(testDb, { jiraKey: "VPL-E2", type: "epic", title: "Thin", description: null });
    const ctx = await buildEpicContext("VPL-E2");
    expect(ctx).toContain("VPL-E2");
    expect(ctx).toContain("none yet");
  });
});

describe("buildFollowUpContent (epic mode)", () => {
  it("omits split-mode and title reminders for epics", () => {
    const result = buildFollowUpContent(
      { localDraft: "draft", localTitle: null, targetTicketKey: null, mode: "epic" },
      "VPL-E1",
      "tighten the scope",
      false,
    );
    expect(result.content).not.toContain("Split mode");
    expect(result.content).not.toContain("title");
    expect(result.content).toContain("[codebase-research: off]");
  });
});

describe("sendStoryWriterMessage (epic mode, first message)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockAgentFetch.mockReset();
    // Workspace acknowledges the task (skill output may be empty/absent in 292).
    mockAgentFetch.mockResolvedValue({ ok: true, data: { id: "task-epic-1" }, status: 200 });
  });

  it("invokes write-story-draft on the workspace with epic context and no epic-suggestion block", async () => {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-epic" });
    seedStoryWriterSession(testDb, {
      id: "sess-epic",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      localDraft: "Improve checkout",
    });

    const result = await sendStoryWriterMessage({
      key: "VPL-E1",
      content: "Help me work this out",
      codebaseResearch: false,
    });

    expect(result.taskId).toBe("task-epic-1");
    expect(mockAgentFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockAgentFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    // No direct LLM in Bridge: the only outbound call is to the workspace task API.
    expect(url).toBe("/api/tasks");
    expect(opts.body.skill).toBe("write-story-draft");

    const args = (opts.body.args as { args: string }).args;
    // Epic context fed through.
    expect(args).toContain("VPL-E1 - Checkout revamp");
    expect(args).toContain("VPL-201");
    expect(args).toContain("Checkout spec");
    expect(args).toContain("wireframe.png");
    expect(args).toContain("Help me work this out");
    // Story-only epic-suggestion block must be omitted for an epic subject.
    expect(args).not.toContain("epic-suggestion");
    expect(args).not.toContain("title-suggestions");
  });
});
