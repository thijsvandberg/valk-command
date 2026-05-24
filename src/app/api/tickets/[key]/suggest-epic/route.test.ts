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
import { ticket } from "@/db/schema";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-10/suggest-epic", {
    method: "POST",
  });
}

function seedTicket(key: string, title: string, type: string) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title,
    type,
    status: "TO DO",
  }).run();
}

describe("POST /api/tickets/[key]/suggest-epic", () => {
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

  it("returns 404 when no epics exist", async () => {
    seedTicket("VPL-10", "Some story", "story");
    const response = await POST(makeRequest(), makeParams("VPL-10"));
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("No epics available");
  });

  it("submits suggest-epic skill and returns taskId", async () => {
    seedTicket("VPL-10", "Add login form", "story");
    seedTicket("VPL-1", "Auth Epic", "epic");

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

    expect(mockAgentFetch).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          skill: "suggest-epic",
          args: expect.objectContaining({
            ticketKey: "VPL-10",
            ticketTitle: "Add login form",
          }),
        }),
      }),
    );
  });

  it("returns 502 when agent is unreachable", async () => {
    seedTicket("VPL-10", "Some story", "story");
    seedTicket("VPL-1", "Auth Epic", "epic");

    mockAgentFetch.mockResolvedValue({
      ok: false,
      error: { error: "Agent unreachable", code: "UNREACHABLE" },
      status: 502,
    });

    const response = await POST(makeRequest(), makeParams("VPL-10"));
    expect(response.status).toBe(502);
  });
});
