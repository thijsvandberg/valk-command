// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

const mockAgentFetch = vi.fn();
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from "./route";
import { ticket, ticketLocalEdit, jiraComment, ticketStatusChange } from "@/db/schema";
import { randomUUID } from "crypto";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(key: string): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/generate-test-doc`, {
    method: "POST",
  });
}

function seedTicket(key: string, title: string, opts?: { description?: string; type?: string }) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title,
    type: opts?.type ?? "story",
    status: "TEST",
    description: opts?.description ?? null,
  }).run();
}

describe("POST /api/tickets/[key]/generate-test-doc", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockAgentFetch.mockReset();
  });

  it("returns 404 when ticket does not exist", async () => {
    const response = await POST(makeRequest("VPL-999"), makeParams("VPL-999"));
    expect(response.status).toBe(404);
  });

  it("returns 409 for draft tickets and never dispatches", async () => {
    const response = await POST(makeRequest("DRAFT-abc123"), makeParams("DRAFT-abc123"));
    expect(response.status).toBe(409);
    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("dispatches the skill with description, comments and status changes", async () => {
    seedTicket("VPL-10", "Fix forgot password link", {
      description: "Old URL vs new URL",
      type: "bug",
    });
    testDb.insert(jiraComment).values({
      id: randomUUID(),
      ticketKey: "VPL-10",
      authorName: "Frank",
      content: "Test case: UAT1 link",
      createdAt: "2026-06-24 10:00:00",
    }).run();
    testDb.insert(ticketStatusChange).values({
      id: randomUUID(),
      ticketKey: "VPL-10",
      fromStatus: "IN PROGRESS",
      toStatus: "TEST",
      changedAt: "2026-06-25T09:00:00.000Z",
    }).run();

    mockAgentFetch.mockResolvedValue({ ok: true, data: { id: "task-1" }, status: 200 });

    const response = await POST(makeRequest("VPL-10"), makeParams("VPL-10"));
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.taskId).toBe("task-1");
    expect(data.streamUrl).toBe("/api/workspace-tasks/task-1/stream");

    const args = mockAgentFetch.mock.calls[0][1].body.args;
    expect(mockAgentFetch.mock.calls[0][1].body.skill).toBe("generate-test-doc");
    expect(args.ticketKey).toBe("VPL-10");
    expect(args.ticketType).toBe("bug");
    expect(args.ticketDescription).toBe("Old URL vs new URL");
    expect(JSON.parse(args.comments)).toEqual([
      { author: "Frank", createdAt: "2026-06-24 10:00:00", content: "Test case: UAT1 link" },
    ]);
    expect(JSON.parse(args.statusChanges)).toEqual([
      { fromStatus: "IN PROGRESS", toStatus: "TEST", changedAt: "2026-06-25T09:00:00.000Z" },
    ]);
  });

  it("prefers the local-edit description over the Jira mirror", async () => {
    seedTicket("VPL-10", "Story", { description: "stale mirror" });
    testDb.insert(ticketLocalEdit).values({
      id: randomUUID(),
      ticketKey: "VPL-10",
      field: "description",
      localValue: "fresh local edit",
    }).run();

    mockAgentFetch.mockResolvedValue({ ok: true, data: { id: "task-2" }, status: 200 });

    await POST(makeRequest("VPL-10"), makeParams("VPL-10"));

    const args = mockAgentFetch.mock.calls[0][1].body.args;
    expect(args.ticketDescription).toBe("fresh local edit");
  });

  it("returns 502 when the agent is unreachable", async () => {
    seedTicket("VPL-10", "Story");
    mockAgentFetch.mockResolvedValue({
      ok: false,
      error: { error: "Agent unreachable", code: "UNREACHABLE" },
      status: 502,
    });

    const response = await POST(makeRequest("VPL-10"), makeParams("VPL-10"));
    expect(response.status).toBe(502);
  });
});
