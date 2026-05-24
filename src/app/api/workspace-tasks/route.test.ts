// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/lib/task-stream-handler", () => ({
  captureTaskStream: vi.fn(),
}));

vi.mock("@/db/next-sequence", () => ({
  nextSequence: vi.fn().mockReturnValue(1),
}));

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    query: {
      conversation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      workspaceTask: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue(Promise.resolve()),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve()),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([]),
        }),
      }),
    }),
  };
  return { mockDb };
});

vi.mock("@/db", () => ({
  db: mockDb,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => cb()),
  };
});

import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";
import { GET, POST } from "./route";

function makeGetRequest(search = "") {
  return new Request(`http://localhost:3100/api/workspace-tasks${search}`);
}

describe("GET /api/workspace-tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(applyRateLimit).mockReturnValue(null);
  });

  it("returns agent data on success", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: [{ id: "task-1", status: "running" }],
      status: 200,
      retryCount: 0,
    });

    const response = await GET(makeGetRequest());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([{ id: "task-1", status: "running" }]);
  });

  it("returns 502 error when agent fails", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: false,
      error: { error: "Agent unreachable", code: "UNREACHABLE" },
      status: 502,
      retryCount: 0,
    });

    const response = await GET(makeGetRequest());
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBe("Agent unreachable");
    expect(data.code).toBe("UNREACHABLE");
  });

  it("queries local DB when conversationId filter provided", async () => {
    const mockRows = [{ id: "task-1", status: "running", conversationId: "conv-1" }];
    mockDb.select.mockReturnValue({
      from: () => ({
        where: () => ({
          all: () => mockRows,
        }),
      }),
    });

    const response = await GET(makeGetRequest("?conversationId=conv-1&status=running"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(mockRows);
    // Should NOT call agentFetch when filtering by conversationId
    expect(vi.mocked(agentFetch)).not.toHaveBeenCalled();
  });
});

describe("POST /api/workspace-tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(applyRateLimit).mockReturnValue(null);
    mockDb.query.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
  });

  it("posts valid task and returns agent data with conversationId", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { id: "task-new" },
      status: 201,
      retryCount: 0,
    });

    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({ skillName: "investigate", conversationId: "conv-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBe("task-new");
    expect(data.conversationId).toBe("conv-1");
  });

  it("returns 400 when skillName is missing", async () => {
    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({ conversationId: "conv-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/skillName/);
  });

  it("returns 502 when agent returns error", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: false,
      error: { error: "Internal agent error", code: "SERVER_ERROR" },
      status: 500,
      retryCount: 2,
    });

    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({ skillName: "investigate" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(applyRateLimit).mockReturnValue(
      new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })
    );

    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({ skillName: "investigate" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(429);
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: "not-valid-json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("accepts skill field as alias for skillName", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { id: "task-alias" },
      status: 201,
      retryCount: 0,
    });

    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({ skill: "investigate" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it("builds chat title and summary from message content", async () => {
    mockDb.query.conversation.findFirst.mockResolvedValue(null);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values: insertValues });

    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { id: "task-chat" },
      status: 201,
      retryCount: 0,
    });

    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({
        skillName: "chat",
        args: { args: "draft een mail naar Shiji over group reservations" },
      }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(insertValues).toHaveBeenCalledTimes(2);
    const convCall = insertValues.mock.calls[0][0];
    expect(convCall.title).toBe("Chat: draft een mail naar Shiji over group reservations");
    const msgCall = insertValues.mock.calls[1][0];
    expect(msgCall.role).toBe("user");
    expect(msgCall.content).toBe("draft een mail naar Shiji over group reservations");
  });

  it("updates 'New conversation' title when conversation already exists", async () => {
    mockDb.query.conversation.findFirst.mockResolvedValue({ id: "conv-1", title: "New conversation" });
    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockDb.update.mockReturnValue({ set: mockSet });

    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { id: "task-update" },
      status: 201,
      retryCount: 0,
    });

    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({
        skillName: "chat",
        args: { args: "what is the status of VPL-123?" },
        conversationId: "conv-1",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(mockDb.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      title: "Chat: what is the status of VPL-123?",
    }));
  });

  it("creates conversation with descriptive title and saves user prompt for suggest-sprint-goal", async () => {
    mockDb.query.conversation.findFirst.mockResolvedValue(null);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values: insertValues });

    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { id: "task-goal" },
      status: 201,
      retryCount: 0,
    });

    const request = new Request("http://localhost:3100/api/workspace-tasks", {
      method: "POST",
      body: JSON.stringify({
        skillName: "suggest-sprint-goal",
        args: { sprintName: "VPL Sprint 48", tickets: JSON.stringify([{ key: "VPL-1" }, { key: "VPL-2" }]) },
      }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(201);

    // Should insert conversation with sprint-specific title, then insert user message
    expect(insertValues).toHaveBeenCalledTimes(2);
    const convCall = insertValues.mock.calls[0][0];
    expect(convCall.title).toBe("Sprint Goal: VPL Sprint 48");
    const msgCall = insertValues.mock.calls[1][0];
    expect(msgCall.role).toBe("user");
    expect(msgCall.content).toBe("Suggest a sprint goal for VPL Sprint 48 based on 2 tickets.");
  });
});
