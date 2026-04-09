import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function seedTicket(db: BetterSQLite3Database<typeof schema>, key: string, jiraId: string | null = null) {
  db.insert(ticket)
    .values({ jiraKey: key, jiraId, title: `Ticket ${key}`, status: "TO DO" })
    .run();
}

describe("GET /api/tickets/[key]/dev-info", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDb = createTestDb();
    process.env.JIRA_CLOUD_ID = "test-cloud-id";
    process.env.JIRA_EMAIL = "test@example.com";
    process.env.JIRA_API_TOKEN = "test-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns empty arrays when ticket has no jiraId", async () => {
    seedTicket(testDb, "VPL-1");

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-1/dev-info"),
      makeParams("VPL-1"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
  });

  it("returns empty arrays when ticket not found", async () => {
    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-999/dev-info"),
      makeParams("VPL-999"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
  });

  it("returns empty arrays when Jira is not configured", async () => {
    delete process.env.JIRA_CLOUD_ID;
    delete process.env.JIRA_BASE_URL;
    seedTicket(testDb, "VPL-1", "10042");

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-1/dev-info"),
      makeParams("VPL-1"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
  });

  it("normalises Jira dev-status response into expected shape", async () => {
    seedTicket(testDb, "VPL-42", "10042");

    const branchResponse = {
      detail: [{
        branches: [{
          name: "feature/VPL-42-dev-panel",
          url: "https://bitbucket.org/repo/branch/feature/VPL-42-dev-panel",
          lastCommit: {
            id: "abc123",
            message: "feat: add dev panel",
            authorTimestamp: "2026-04-09T10:00:00Z",
            author: { name: "Thijs" },
          },
        }],
        commits: [{
          id: "abc123",
          message: "feat: add dev panel",
          authorTimestamp: "2026-04-09T10:00:00Z",
          author: { name: "Thijs" },
          url: "https://bitbucket.org/repo/commits/abc123",
        }],
      }],
    };

    const prResponse = {
      detail: [{
        pullRequests: [{
          id: "77",
          name: "VPL-42: Dev panel",
          url: "https://bitbucket.org/repo/pull-requests/77",
          status: "OPEN",
          author: { name: "Thijs" },
          reviewers: [{ name: "Alice", approved: false }],
        }],
      }],
    };

    const buildResponse = {
      detail: [{
        builds: [{
          buildNumber: 1,
          name: "Pipeline #1",
          url: "https://bitbucket.org/repo/pipelines/1",
          state: "SUCCESSFUL",
          completionDate: "2026-04-09T11:00:00Z",
        }],
      }],
    };

    let callIndex = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const responses = [branchResponse, prResponse, buildResponse];
      const body = responses[callIndex++] ?? {};
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);

    expect(data.branches).toHaveLength(1);
    expect(data.branches[0]).toEqual({
      name: "feature/VPL-42-dev-panel",
      url: "https://bitbucket.org/repo/branch/feature/VPL-42-dev-panel",
      lastCommit: {
        id: "abc123",
        message: "feat: add dev panel",
        date: "2026-04-09T10:00:00Z",
        author: "Thijs",
      },
    });

    expect(data.pullRequests).toHaveLength(1);
    expect(data.pullRequests[0]).toEqual({
      id: "77",
      title: "VPL-42: Dev panel",
      url: "https://bitbucket.org/repo/pull-requests/77",
      status: "OPEN",
      author: "Thijs",
      reviewers: ["Alice"],
    });

    expect(data.commits).toHaveLength(1);
    expect(data.commits[0].id).toBe("abc123");

    expect(data.builds).toHaveLength(1);
    expect(data.builds[0]).toEqual({
      name: "Pipeline #1",
      url: "https://bitbucket.org/repo/pipelines/1",
      state: "SUCCESSFUL",
      completedAt: "2026-04-09T11:00:00Z",
    });
  });

  it("returns empty arrays on fetch failure", async () => {
    seedTicket(testDb, "VPL-42", "10042");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("Network failure");
    });

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
  });

  it("handles non-OK responses gracefully", async () => {
    seedTicket(testDb, "VPL-42", "10042");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("Forbidden", { status: 403 });
    });

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
  });

  it("uses JIRA_DEV_APPLICATION_TYPE env var when set", async () => {
    seedTicket(testDb, "VPL-42", "10042");
    process.env.JIRA_DEV_APPLICATION_TYPE = "bitbucket";

    const fetchUrls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      fetchUrls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );

    expect(fetchUrls.length).toBeGreaterThan(0);
    for (const url of fetchUrls) {
      expect(url).toContain("applicationType=bitbucket");
    }
  });
});
