// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();
const mockGetIssue = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: { ticket: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } },
    update: () => ({ set: () => ({ where: () => ({}) }) }),
  },
}));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    get isLive() { return true; },
    getIssue: (...args: unknown[]) => mockGetIssue(...args),
  },
  JiraApiError: class JiraApiError extends Error {
    constructor(public status: number) { super("jira error"); }
  },
}));

// Mirrors the canonical mapping (unit-tested in upsert-issue.test.ts) without
// pulling the heavy module under these partial mocks.
vi.mock("@/lib/upsert-issue", () => ({
  normalizeStatus: (name: string) => {
    const u = name.toUpperCase();
    if (u.includes("PROGRESS")) return "IN PROGRESS";
    if (u === "DONE" || u === "CLOSED" || u === "RESOLVED") return "DONE";
    return u;
  },
}));

import { GET } from "./route";

function makeRequest(params: Record<string, string>): Request {
  const sp = new URLSearchParams(params);
  return new Request(`http://localhost:3100/api/jira/check-updated?${sp}`);
}

describe("GET /api/jira/check-updated", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockGetIssue.mockReset();
  });

  it("returns 400 when key is missing", async () => {
    const res = await GET(new Request("http://localhost:3100/api/jira/check-updated"));
    expect(res.status).toBe(400);
    expect(mockGetIssue).not.toHaveBeenCalled();
  });

  it("rejects a malformed key with 400 and never calls Jira", async () => {
    const res = await GET(makeRequest({ key: "VPL-1/transitions" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid issue key");
    expect(mockGetIssue).not.toHaveBeenCalled();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("rejects keys with query/fragment injection characters", async () => {
    for (const bad of ["VPL-1?expand=x", "VPL-1#frag", "../secret", "VPL"]) {
      const res = await GET(makeRequest({ key: bad }));
      expect(res.status).toBe(400);
    }
    expect(mockGetIssue).not.toHaveBeenCalled();
  });

  it("performs the freshness check for a valid key", async () => {
    mockFindFirst.mockResolvedValue({ jiraUpdatedAt: "2026-01-01T00:00:00Z" });
    mockGetIssue.mockResolvedValue({ fields: { updated: "2026-02-01T00:00:00Z" } });

    const res = await GET(makeRequest({ key: "VPL-123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stale).toBe(true);
    expect(data.key).toBe("VPL-123");
    expect(mockGetIssue).toHaveBeenCalledWith("VPL-123");
  });

  it("reports stale on a status drift even when the updated timestamp matches", async () => {
    mockFindFirst.mockResolvedValue({ jiraUpdatedAt: "2026-01-01T00:00:00Z", status: "DONE" });
    mockGetIssue.mockResolvedValue({
      fields: { updated: "2026-01-01T00:00:00Z", status: { name: "In Progress" } },
    });

    const res = await GET(makeRequest({ key: "VPL-123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stale).toBe(true);
    expect(data.localStatus).toBe("DONE");
    expect(data.remoteStatus).toBe("IN PROGRESS");
  });

  it("is not stale when timestamp and status both match", async () => {
    mockFindFirst.mockResolvedValue({ jiraUpdatedAt: "2026-01-01T00:00:00Z", status: "IN PROGRESS" });
    mockGetIssue.mockResolvedValue({
      fields: { updated: "2026-01-01T00:00:00Z", status: { name: "In Progress" } },
    });

    const res = await GET(makeRequest({ key: "VPL-123" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stale).toBe(false);
  });
});
