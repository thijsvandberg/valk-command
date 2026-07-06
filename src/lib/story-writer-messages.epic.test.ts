// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import {
  seedTicket,
  seedConversation,
  seedStoryWriterSession,
  seedMessage,
} from "@/test/builders";
import { ticketConfluenceLink, ticketAttachment, epicChildDraft } from "@/db/schema";
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

import {
  buildEpicContext,
  buildFollowUpContent,
  sendStoryWriterMessage,
  epicPhaseUsesBreakdownSkill,
  computeContentHash,
} from "./story-writer-messages";

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

  // BRDG-487 #8: the epic's current (possibly unsaved) local draft must win over
  // the Jira-synced description so a breakdown/refine turn reflects what the PO
  // just edited in the draft view, not the last-pushed version.
  it("uses the session local draft over the Jira description when provided", async () => {
    seedEpicWithContext("VPL-E1");
    const ctx = await buildEpicContext("VPL-E1", "Freshly edited epic body the PO just typed");

    expect(ctx).toContain("Freshly edited epic body the PO just typed");
    expect(ctx).not.toContain("Improve checkout");
  });

  it("falls back to the Jira description when the local draft is empty", async () => {
    seedEpicWithContext("VPL-E1");
    expect(await buildEpicContext("VPL-E1", "   ")).toContain("Improve checkout");
    expect(await buildEpicContext("VPL-E1", null)).toContain("Improve checkout");
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

describe("epicPhaseUsesBreakdownSkill", () => {
  it("uses the breakdown skill in discovery/breakdown/refine/sprints", () => {
    for (const p of ["discovery", "breakdown", "refine", "sprints"]) {
      expect(epicPhaseUsesBreakdownSkill(p)).toBe(true);
    }
  });

  it("keeps the feed phase on the epic draft flow", () => {
    expect(epicPhaseUsesBreakdownSkill("feed")).toBe(false);
    expect(epicPhaseUsesBreakdownSkill(null)).toBe(false);
  });

  it("no longer recognises the removed 'detail' phase (BRDG-488)", () => {
    expect(epicPhaseUsesBreakdownSkill("detail")).toBe(false);
  });
});

describe("sendStoryWriterMessage (epic mode, phase-aware breakdown)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockAgentFetch.mockReset();
    mockAgentFetch.mockResolvedValue({ ok: true, data: { id: "task-bd" }, status: 200 });
  });

  it("invokes break-down-epic with phase and existing cards in the breakdown phase", async () => {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-bd" });
    seedStoryWriterSession(testDb, {
      id: "sess-bd",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "breakdown",
    });
    testDb.insert(epicChildDraft).values({
      id: randomUUID(),
      sessionId: "sess-bd",
      cardIndex: 0,
      title: "Existing card",
      bullets: ["bullet one"],
    }).run();

    await sendStoryWriterMessage({ key: "VPL-E1", content: "split card 1", codebaseResearch: false });

    expect(mockAgentFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockAgentFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(url).toBe("/api/tasks");
    expect(opts.body.skill).toBe("break-down-epic");

    const args = (opts.body.args as { args: string }).args;
    expect(args).toContain("[phase: breakdown]");
    expect(args).toContain("Existing card");
    expect(args).toContain("VPL-E1 - Checkout revamp");
    expect(args).toContain("split card 1");
  });

  it("threads the session local draft into the breakdown context (BRDG-487 #8)", async () => {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-draft" });
    seedStoryWriterSession(testDb, {
      id: "sess-draft",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "breakdown",
      localDraft: "PO just rewrote the epic body inline",
    });

    await sendStoryWriterMessage({ key: "VPL-E1", content: "break it down", codebaseResearch: false });

    const [, opts] = mockAgentFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    const args = (opts.body.args as { args: string }).args;
    // The live local draft, not the stale Jira description, is what the AI sees.
    expect(args).toContain("PO just rewrote the epic body inline");
    expect(args).not.toContain("Improve checkout");
  });

  it("carries the <story-detail> tag contract in the refine phase first message", async () => {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-detail" });
    seedStoryWriterSession(testDb, {
      id: "sess-detail",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "refine",
    });
    testDb.insert(epicChildDraft).values({
      id: randomUUID(),
      sessionId: "sess-detail",
      cardIndex: 0,
      title: "Cart summary",
      bullets: ["bullet"],
    }).run();

    await sendStoryWriterMessage({
      key: "VPL-E1",
      content: "Deepen story 1 into a full description and acceptance criteria.",
      codebaseResearch: false,
    });

    const [, opts] = mockAgentFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(opts.body.skill).toBe("break-down-epic");
    const args = (opts.body.args as { args: string }).args;
    expect(args).toContain("[phase: refine]");
    expect(args).toContain("<story-detail index=");
  });

  it("invokes break-down-epic in the discovery phase (questions)", async () => {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-disc" });
    seedStoryWriterSession(testDb, {
      id: "sess-disc",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "discovery",
    });

    await sendStoryWriterMessage({ key: "VPL-E1", content: "help me scope this", codebaseResearch: false });

    const [, opts] = mockAgentFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(opts.body.skill).toBe("break-down-epic");
    const args = (opts.body.args as { args: string }).args;
    expect(args).toContain("[phase: discovery]");
    expect(args).toContain("No breakdown yet");
  });

  it("keeps write-story-draft in the feed phase (epic enrichment)", async () => {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-feed" });
    seedStoryWriterSession(testDb, {
      id: "sess-feed",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "feed",
    });

    await sendStoryWriterMessage({ key: "VPL-E1", content: "sharpen the epic", codebaseResearch: false });

    const [, opts] = mockAgentFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(opts.body.skill).toBe("write-story-draft");
  });

  // BRDG-479: a breakdown-phase FOLLOW-UP (the session already has feed-phase
  // history) must still dispatch break-down-epic as a fresh skill task, not a
  // plain conversation follow-up that would resume the feed session's
  // write-story-draft skill and answer in prose.
  it("dispatches break-down-epic as a fresh skill task for a breakdown follow-up", async () => {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-switch" });
    seedStoryWriterSession(testDb, {
      id: "sess-switch",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "breakdown",
    });
    // Prior feed-phase turn: this makes it a follow-up (not the first message).
    seedMessage(testDb, { conversationId: conv.id, role: "user", content: "sharpen the epic", timestamp: "2026-07-06T10:00:00.000Z" });
    seedMessage(testDb, { conversationId: conv.id, role: "assistant", content: "Here is a sharpened epic description.", timestamp: "2026-07-06T10:01:00.000Z" });

    await sendStoryWriterMessage({ key: "VPL-E1", content: "break this epic into stories", codebaseResearch: false });

    expect(mockAgentFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockAgentFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    // Not the plain follow-up endpoint.
    expect(url).toBe("/api/tasks");
    expect(opts.body.skill).toBe("break-down-epic");
    // Fresh VRW conversation so the new skill's session is actually created.
    expect(opts.body.conversationId).not.toBe(conv.id);
    // Prior chat is carried in as context.
    const args = (opts.body.args as { args: string }).args;
    expect(args).toContain("Previous conversation (for context)");
    expect(args).toContain("Here is a sharpened epic description.");
    expect(args).toContain("[phase: breakdown]");
  });
});

describe("sendStoryWriterMessage dedup window (BRDG-479)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockAgentFetch.mockReset();
    mockAgentFetch.mockResolvedValue({ ok: true, data: { id: "task-x" }, status: 200 });
  });

  function seedWithPriorIdentical(content: string, timestamp: string) {
    seedEpicWithContext("VPL-E1");
    const conv = seedConversation(testDb, { id: "conv-dedup" });
    seedStoryWriterSession(testDb, {
      id: "sess-dedup",
      ticketKey: "VPL-E1",
      conversationId: conv.id,
      status: "active",
      mode: "epic",
      phase: "feed",
    });
    // Prior assistant turn makes this a follow-up (not the first message).
    seedMessage(testDb, { conversationId: conv.id, role: "assistant", content: "ok", timestamp: "2026-01-01T00:00:01.000Z" });
    // The prior identical user message the dedup checks against.
    seedMessage(testDb, {
      conversationId: conv.id,
      role: "user",
      content,
      contentHash: computeContentHash(conv.id, content),
      timestamp,
    });
    return conv;
  }

  // Regression: message.timestamp is ISO ("...T..Z"), datetime('now') is
  // space-separated; a raw string compare treated every identical message as
  // "recent" forever, so re-sending a fixed string (the breakdown request) was
  // always blocked.
  it("does not block an identical message sent long ago", async () => {
    const content = "Break this epic down into child stories.";
    seedWithPriorIdentical(content, "2026-01-01T00:00:00.000Z");

    const result = await sendStoryWriterMessage({ key: "VPL-E1", content, codebaseResearch: false });

    expect(result.messageId).toBeTruthy();
    expect(mockAgentFetch).toHaveBeenCalledTimes(1);
  });

  it("still blocks an identical message sent within the last 30s", async () => {
    const content = "Break this epic down into child stories.";
    seedWithPriorIdentical(content, new Date().toISOString());

    await expect(
      sendStoryWriterMessage({ key: "VPL-E1", content, codebaseResearch: false }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    expect(mockAgentFetch).not.toHaveBeenCalled();
  });
});

describe("buildFollowUpContent (epic breakdown phase)", () => {
  it("carries phase and breakdown state for a breakdown-phase follow-up", () => {
    const result = buildFollowUpContent(
      { localDraft: null, localTitle: null, targetTicketKey: null, mode: "epic", phase: "breakdown" },
      "VPL-E1",
      "remove card 2",
      false,
      "[Current breakdown (3 cards)]",
    );
    expect(result.content).toContain("[phase: breakdown]");
    expect(result.content).toContain("[Current breakdown (3 cards)]");
    expect(result.content).toContain("remove card 2");
    expect(result.isEdit).toBe(true);
  });

  it("adds the <story-detail> instruction on a refine-phase follow-up", () => {
    const result = buildFollowUpContent(
      { localDraft: null, localTitle: null, targetTicketKey: null, mode: "epic", phase: "refine" },
      "VPL-E1",
      "Deepen story 2",
      false,
      "[Current breakdown (3 cards)]",
    );
    expect(result.content).toContain("[phase: refine]");
    expect(result.content).toContain("<story-detail index=");
  });
});
