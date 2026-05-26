// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn().mockResolvedValue({ ok: true, data: {}, status: 200, retryCount: 0 }),
}));

vi.mock("@/lib/api-validation", () => ({
  validatePathParam: () => null,
}));

import { POST } from "./route";
import { workspaceTask, message, conversation } from "@/db/schema";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/workspace-tasks/[id]/cancel", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 404 when task does not exist", async () => {
    const res = await POST(new Request("http://localhost/api/workspace-tasks/nope/cancel", { method: "POST" }), makeParams("nope"));
    expect(res.status).toBe(404);
  });

  it("cancels a running task and marks the workspace task as cancelled", async () => {
    const taskId = randomUUID();

    testDb.insert(workspaceTask).values({
      id: taskId,
      skillName: "chat",
      status: "running",
      startedAt: new Date().toISOString(),
    }).run();

    const res = await POST(new Request("http://localhost/cancel", { method: "POST" }), makeParams(taskId));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const [updatedTask] = testDb.select().from(workspaceTask).where(eq(workspaceTask.id, taskId)).all();
    expect(updatedTask?.status).toBe("cancelled");
    expect(updatedTask?.completedAt).toBeTruthy();
  });

  it("marks messages as cancelled when task has a conversation", async () => {
    const taskId = randomUUID();
    const convId = randomUUID();
    const userMsgId = randomUUID();

    testDb.insert(conversation).values({ id: convId, title: "Test" }).run();
    testDb.insert(workspaceTask).values({
      id: taskId,
      skillName: "chat",
      status: "running",
      startedAt: new Date().toISOString(),
      conversationId: convId,
    }).run();
    testDb.insert(message).values({
      id: userMsgId,
      conversationId: convId,
      role: "user",
      content: "Hello",
      timestamp: new Date().toISOString(),
    }).run();

    const res = await POST(new Request("http://localhost/cancel", { method: "POST" }), makeParams(taskId));
    expect(res.status).toBe(200);

    const [updatedMsg] = testDb.select().from(message).where(eq(message.id, userMsgId)).all();
    expect(updatedMsg?.cancelled).toBe(true);
  });

  it("does not cancel an already completed task", async () => {
    const taskId = randomUUID();

    testDb.insert(workspaceTask).values({
      id: taskId,
      skillName: "chat",
      status: "completed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      output: "done",
    }).run();

    const res = await POST(new Request("http://localhost/cancel", { method: "POST" }), makeParams(taskId));
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.reason).toBe("already_completed");
  });

  it("is idempotent for already cancelled tasks", async () => {
    const taskId = randomUUID();

    testDb.insert(workspaceTask).values({
      id: taskId,
      skillName: "chat",
      status: "cancelled",
      startedAt: new Date().toISOString(),
    }).run();

    const res = await POST(new Request("http://localhost/cancel", { method: "POST" }), makeParams(taskId));
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
