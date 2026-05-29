// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { workspaceTask, message, conversation } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/db/next-sequence", () => ({
  nextSequence: vi.fn().mockReturnValue(1),
}));

vi.mock("@/lib/agent-proxy", () => ({
  agentUrl: (path: string) => `http://agent${path}`,
  agentHeaders: () => ({ Authorization: "Bearer test" }),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

import { captureTaskStream } from "./task-stream-handler";
import { createNotification } from "@/lib/notifications";

function makeSSEStream(events: Array<{ event?: string; data: string }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  for (const e of events) {
    if (e.event) lines.push(`event:${e.event}`);
    lines.push(`data:${e.data}`);
    lines.push("");
  }
  const chunk = encoder.encode(lines.join("\n") + "\n");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
}

function makeFetchResponse(events: Array<{ event?: string; data: string }>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: makeSSEStream(events),
  } as unknown as Response;
}

function seedConversation(id: string) {
  testDb.insert(conversation).values({
    id,
    title: "Test",
    createdAt: new Date().toISOString(),
  }).run();
}

describe("captureTaskStream", () => {
  const convId = "conv-1";

  beforeEach(() => {
    vi.restoreAllMocks();
    testDb = createTestDb();
    seedConversation(convId);
  });

  const baseParams = {
    taskId: "task-1",
    skillName: "review",
    conversationId: "conv-1",
    relatedTicket: "VALK-1",
  };

  it("inserts workspaceTask record on start", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "done" }) }]),
    );

    await captureTaskStream(baseParams);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-1")).get();
    expect(task).toBeTruthy();
    expect(task!.skillName).toBe("review");
    expect(task!.conversationId).toBe(convId);
  });

  it("parses result event and updates task to completed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "review output" }) }]),
    );

    await captureTaskStream(baseParams);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-1")).get();
    expect(task!.status).toBe("completed");
    expect(task!.output).toBe("review output");
  });

  it("saves assistant message to conversation", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "msg content" }) }]),
    );

    await captureTaskStream(baseParams);

    const msgs = testDb.select().from(message).where(eq(message.conversationId, convId)).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("msg content");
    expect(msgs[0].role).toBe("assistant");
  });

  it("deduplication: skips if message already exists for workspaceTaskId", async () => {
    // Pre-insert a message with the same workspaceTaskId
    testDb.insert(message).values({
      id: randomUUID(),
      conversationId: convId,
      role: "assistant",
      content: "existing",
      workspaceTaskId: "task-1",
      timestamp: new Date().toISOString(),
      sequence: 1,
    }).run();

    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "new content" }) }]),
    );

    await captureTaskStream(baseParams);

    const msgs = testDb.select().from(message).where(eq(message.conversationId, convId)).all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("existing");
  });

  it("parses error event and marks task as failed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "error", data: JSON.stringify({ message: "oops" }) }]),
    );

    await captureTaskStream(baseParams);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-1")).get();
    expect(task!.status).toBe("failed");
    expect(task!.error).toBe("oops");
  });

  it("handles JSON parsing failure gracefully for result event", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: "not-json" }]),
    );

    await captureTaskStream(baseParams);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-1")).get();
    expect(task!.status).toBe("completed");
    expect(task!.output).toBe("not-json");
  });

  it("handles JSON parsing failure gracefully for error event", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "error", data: "bad-json" }]),
    );

    await captureTaskStream(baseParams);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-1")).get();
    expect(task!.status).toBe("failed");
    expect(task!.error).toBe("Task failed");
  });

  it("marks task as failed when HTTP response is not ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 500, body: null,
    } as unknown as Response);

    await captureTaskStream(baseParams);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-1")).get();
    expect(task!.status).toBe("failed");
    expect(task!.error).toContain("HTTP 500");
  });

  it("checks if task was cancelled before saving output", async () => {
    const params = { ...baseParams, taskId: "task-cancel" };

    // Mock fetch so that while streaming, we cancel the task in DB
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      // By the time fetch resolves, the task row already exists. Mark it cancelled.
      testDb.update(workspaceTask)
        .set({ status: "cancelled" })
        .where(eq(workspaceTask.id, "task-cancel"))
        .run();
      return makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "done" }) }]);
    });

    await captureTaskStream(params);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-cancel")).get();
    expect(task!.status).toBe("cancelled");
    // No message should have been saved
    const msgs = testDb.select().from(message).where(eq(message.workspaceTaskId, "task-cancel")).all();
    expect(msgs).toHaveLength(0);
  });

  it("creates stakeholder-export-ready notification for export-stakeholder-summary skill", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "export done" }) }]),
    );

    await captureTaskStream({ ...baseParams, skillName: "export-stakeholder-summary" });

    expect(createNotification).toHaveBeenCalledWith(
      "stakeholder-export-ready",
      expect.stringContaining("Stakeholder export"),
      expect.objectContaining({ category: "agent" }),
    );
  });

  it("creates sprint-goal-ready notification for suggest-sprint-goal skill", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "goal done" }) }]),
    );

    await captureTaskStream({ ...baseParams, skillName: "suggest-sprint-goal" });

    expect(createNotification).toHaveBeenCalledWith(
      "sprint-goal-ready",
      expect.stringContaining("Sprint goal suggestion"),
      expect.objectContaining({ category: "agent" }),
    );
  });

  it("creates generic task-complete notification for other skills", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "ok" }) }]),
    );

    await captureTaskStream(baseParams);

    expect(createNotification).toHaveBeenCalledWith(
      "task-complete",
      expect.stringContaining("review task completed"),
      expect.objectContaining({ category: "agent" }),
    );
  });

  it("updates conversation readAt to null on completion", async () => {
    // Set readAt to a value first
    testDb.update(conversation)
      .set({ readAt: new Date().toISOString() })
      .where(eq(conversation.id, convId)).run();

    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([{ event: "result", data: JSON.stringify({ output: "done" }) }]),
    );

    await captureTaskStream(baseParams);

    const conv = testDb.select().from(conversation).where(eq(conversation.id, convId)).get();
    expect(conv!.readAt).toBeNull();
  });

  it("handles empty stream (no result or error) as failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeFetchResponse([]),
    );

    await captureTaskStream(baseParams);

    const task = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, "task-1")).get();
    expect(task!.status).toBe("failed");
    expect(task!.error).toContain("did not return a result");
  });
});
