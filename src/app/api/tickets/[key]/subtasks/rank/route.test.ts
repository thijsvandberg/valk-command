// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn() } }));
vi.mock("@/lib/sync-jira-timestamp", () => ({ syncJiraTimestamp: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    rankIssues: vi.fn().mockResolvedValue(undefined),
  },
}));

import { POST } from "./route";
import { jiraClient } from "@/lib/jira-client";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-100/subtasks/rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tickets/[key]/subtasks/rank", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when movedKey is missing", async () => {
    const res = await POST(makeRequest({ rankBefore: "VPL-SUB-2" }), makeParams("VPL-100"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when neither rankBefore nor rankAfter provided", async () => {
    const res = await POST(makeRequest({ movedKey: "VPL-SUB-1" }), makeParams("VPL-100"));
    expect(res.status).toBe(400);
  });

  it("ranks with rankBefore and returns ok", async () => {
    const res = await POST(
      makeRequest({ movedKey: "VPL-SUB-1", rankBefore: "VPL-SUB-2" }),
      makeParams("VPL-100"),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(vi.mocked(jiraClient.rankIssues)).toHaveBeenCalledWith(
      ["VPL-SUB-1"], "VPL-SUB-2", undefined,
    );
  });

  it("ranks with rankAfter", async () => {
    const res = await POST(
      makeRequest({ movedKey: "VPL-SUB-1", rankAfter: "VPL-SUB-3" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(jiraClient.rankIssues)).toHaveBeenCalledWith(
      ["VPL-SUB-1"], undefined, "VPL-SUB-3",
    );
  });

  it("returns 502 when Jira fails", async () => {
    vi.mocked(jiraClient.rankIssues).mockRejectedValueOnce(new Error("Jira error"));

    const res = await POST(
      makeRequest({ movedKey: "VPL-SUB-1", rankBefore: "VPL-SUB-2" }),
      makeParams("VPL-100"),
    );
    expect(res.status).toBe(502);
  });
});
