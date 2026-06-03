// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/sync-jira-timestamp", () => ({ syncJiraTimestamp: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getWatchers: vi.fn().mockResolvedValue([]),
    addWatcher: vi.fn().mockResolvedValue(undefined),
    removeWatcher: vi.fn().mockResolvedValue(undefined),
  },
}));

import { GET, POST, DELETE } from "./route";
import { jiraClient } from "@/lib/jira-client";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";

function getRequest(query: string): Request {
  return new Request(`http://localhost:3100/api/jira/watchers${query}`);
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/jira/watchers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(query: string): Request {
  return new Request(`http://localhost:3100/api/jira/watchers${query}`, { method: "DELETE" });
}

describe("/api/jira/watchers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 400 when issueKey is missing", async () => {
      const res = await GET(getRequest(""));
      expect(res.status).toBe(400);
    });

    it("returns the watchers for an issue", async () => {
      vi.mocked(jiraClient.getWatchers).mockResolvedValueOnce([
        { accountId: "acc-1", displayName: "Alice", avatarUrl: null },
      ]);
      const res = await GET(getRequest("?issueKey=VPL-100"));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.watchers).toHaveLength(1);
      expect(vi.mocked(jiraClient.getWatchers)).toHaveBeenCalledWith("VPL-100");
    });

    it("returns 500 when Jira fails", async () => {
      vi.mocked(jiraClient.getWatchers).mockRejectedValueOnce(new Error("Jira down"));
      const res = await GET(getRequest("?issueKey=VPL-100"));
      expect(res.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("returns 400 when issueKey is missing", async () => {
      const res = await POST(postRequest({ accountId: "acc-1" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when accountId is missing", async () => {
      const res = await POST(postRequest({ issueKey: "VPL-100" }));
      expect(res.status).toBe(400);
    });

    it("adds a watcher and syncs the timestamp", async () => {
      const res = await POST(postRequest({ issueKey: "VPL-100", accountId: "acc-1" }));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(vi.mocked(jiraClient.addWatcher)).toHaveBeenCalledWith("VPL-100", "acc-1");
      expect(vi.mocked(syncJiraTimestamp)).toHaveBeenCalledWith("VPL-100");
    });

    it("returns 500 when Jira fails", async () => {
      vi.mocked(jiraClient.addWatcher).mockRejectedValueOnce(new Error("Jira down"));
      const res = await POST(postRequest({ issueKey: "VPL-100", accountId: "acc-1" }));
      expect(res.status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("returns 400 when issueKey is missing", async () => {
      const res = await DELETE(deleteRequest("?accountId=acc-1"));
      expect(res.status).toBe(400);
    });

    it("returns 400 when accountId is missing", async () => {
      const res = await DELETE(deleteRequest("?issueKey=VPL-100"));
      expect(res.status).toBe(400);
    });

    it("removes a watcher and syncs the timestamp", async () => {
      const res = await DELETE(deleteRequest("?issueKey=VPL-100&accountId=acc-1"));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(vi.mocked(jiraClient.removeWatcher)).toHaveBeenCalledWith("VPL-100", "acc-1");
      expect(vi.mocked(syncJiraTimestamp)).toHaveBeenCalledWith("VPL-100");
    });

    it("returns 500 when Jira fails", async () => {
      vi.mocked(jiraClient.removeWatcher).mockRejectedValueOnce(new Error("Jira down"));
      const res = await DELETE(deleteRequest("?issueKey=VPL-100&accountId=acc-1"));
      expect(res.status).toBe(500);
    });
  });
});
