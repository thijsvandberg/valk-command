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
import { ticket, ticketSubtask } from "@/db/schema";
import { randomUUID } from "crypto";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-10/suggest-subtasks", {
    method: "POST",
  });
}

function seedTicket(key: string, title: string, opts?: { description?: string; acceptanceCriteria?: string }) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title,
    type: "story",
    status: "TO DO",
    description: opts?.description ?? null,
    acceptanceCriteria: opts?.acceptanceCriteria ?? null,
  }).run();
}

function seedSubtask(ticketKey: string, subtaskKey: string, title: string) {
  testDb.insert(ticketSubtask).values({
    id: randomUUID(),
    ticketKey,
    subtaskKey,
    title,
    status: "TO DO",
  }).run();
}

describe("POST /api/tickets/[key]/suggest-subtasks", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockAgentFetch.mockReset();
  });

  it("returns 404 when ticket does not exist", async () => {
    const response = await POST(makeRequest(), makeParams("VPL-999"));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Ticket not found");
  });

  it("submits chat skill with prompt and returns taskId", async () => {
    seedTicket("VPL-10", "Add login form", {
      description: "Build a login form with email and password",
      acceptanceCriteria: "Users can log in with valid credentials",
    });

    mockAgentFetch.mockResolvedValue({
      ok: true,
      data: { id: "task-abc-123" },
      status: 200,
    });

    const response = await POST(makeRequest(), makeParams("VPL-10"));
    expect(response.status).toBe(202);
    const data = await response.json();
    expect(data.taskId).toBe("task-abc-123");
    expect(data.streamUrl).toBe("/api/workspace-tasks/task-abc-123/stream");

    const body = mockAgentFetch.mock.calls[0][1].body;
    expect(body.skill).toBe("chat");
    expect(body.args).toContain("VPL-10");
    expect(body.args).toContain("Add login form");
    expect(body.args).toContain("Build a login form with email and password");
    expect(body.args).toContain("Users can log in with valid credentials");
    expect(body.args).toContain("numbered list");
  });

  it("includes existing subtask titles in the prompt", async () => {
    seedTicket("VPL-10", "Add login form");
    seedSubtask("VPL-10", "VPL-11", "Design login UI");
    seedSubtask("VPL-10", "VPL-12", "Add validation");

    mockAgentFetch.mockResolvedValue({
      ok: true,
      data: { id: "task-xyz" },
      status: 200,
    });

    await POST(makeRequest(), makeParams("VPL-10"));

    const prompt = mockAgentFetch.mock.calls[0][1].body.args;
    expect(prompt).toContain("Design login UI");
    expect(prompt).toContain("Add validation");
    expect(prompt).toContain("do not duplicate");
  });

  it("returns 502 when agent is unreachable", async () => {
    seedTicket("VPL-10", "Some story");

    mockAgentFetch.mockResolvedValue({
      ok: false,
      error: { error: "Agent unreachable", code: "UNREACHABLE" },
      status: 502,
    });

    const response = await POST(makeRequest(), makeParams("VPL-10"));
    expect(response.status).toBe(502);
  });

  it("works when description and AC are null", async () => {
    seedTicket("VPL-10", "Minimal ticket");

    mockAgentFetch.mockResolvedValue({
      ok: true,
      data: { id: "task-min" },
      status: 200,
    });

    const response = await POST(makeRequest(), makeParams("VPL-10"));
    expect(response.status).toBe(202);

    const prompt = mockAgentFetch.mock.calls[0][1].body.args;
    expect(prompt).toContain("VPL-10");
    expect(prompt).toContain("Minimal ticket");
    // Should not contain "Description:" or "Acceptance Criteria:" sections
    expect(prompt).not.toContain("Description:");
    expect(prompt).not.toContain("Acceptance Criteria:");
  });
});
