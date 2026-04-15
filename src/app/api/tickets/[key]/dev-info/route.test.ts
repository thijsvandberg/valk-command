import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cache } from "@/lib/cache";

const mockEnv = vi.hoisted(() => ({
  JIRA_CLOUD_ID: "",
  JIRA_BASE_URL: "",
  JIRA_EMAIL: "",
  JIRA_API_TOKEN: "",
  JIRA_PROJECT_KEY: "VPL",
  JIRA_BOARD_ID: "",
  NEXT_PUBLIC_JIRA_BASE_URL: "https://new-story.atlassian.net",
  VALK_AGENT_URL: "http://localhost:3001",
  VALK_AGENT_KEY: "",
  BITBUCKET_WORKSPACE: "my-workspace",
  BITBUCKET_REPO_SLUG: "my-repo",
  BITBUCKET_EMAIL: "test@example.com",
  BITBUCKET_APP_PASSWORD: "test-password",
  BITBUCKET_API_TOKEN: "",
  NEXT_PUBLIC_APP_URL: "http://localhost:3100",
  BT_NEXT_SPRINT_ID: "",
  DB_PATH: "sqlite.db",
  CLERK_ORG_ID: "",
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { GET } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/tickets/[key]/dev-info", () => {
  beforeEach(() => {
    cache.flush();
    mockEnv.BITBUCKET_WORKSPACE = "my-workspace";
    mockEnv.BITBUCKET_REPO_SLUG = "my-repo";
    mockEnv.BITBUCKET_EMAIL = "test@example.com";
    mockEnv.BITBUCKET_APP_PASSWORD = "test-password";
    mockEnv.JIRA_EMAIL = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty arrays when Bitbucket is not configured", async () => {
    mockEnv.BITBUCKET_WORKSPACE = "";
    mockEnv.BITBUCKET_REPO_SLUG = "";

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-1/dev-info"),
      makeParams("VPL-1"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [], deployments: [] });
  });

  it("normalises Bitbucket branch + PR response into expected shape", async () => {
    const branchResponse = {
      values: [{
        name: "feature/VPL-42-dev-panel",
        links: { html: { href: "https://bitbucket.org/ws/repo/branch/feature/VPL-42-dev-panel" } },
        target: {
          hash: "abc123def456789",
          date: "2026-04-09T10:00:00+00:00",
          message: "feat: add dev panel\n\nDetailed description",
          author: { raw: "Thijs <thijs@example.com>", user: { display_name: "Thijs" } },
          links: { html: { href: "https://bitbucket.org/ws/repo/commits/abc123def456789" } },
        },
      }],
    };

    const prResponse = {
      values: [{
        id: 77,
        title: "VPL-42: Dev panel",
        state: "OPEN",
        links: { html: { href: "https://bitbucket.org/ws/repo/pull-requests/77" } },
        author: { display_name: "Thijs" },
        reviewers: [{ display_name: "Alice" }],
        participants: [
          { user: { display_name: "Alice" }, role: "REVIEWER", approved: true, state: "approved" },
        ],
        source: { branch: { name: "feature/VPL-42" }, commit: { hash: "abc123" } },
        destination: { branch: { name: "master" } },
        comment_count: 3,
        task_count: 1,
        created_on: "2026-04-01T10:00:00+00:00",
        updated_on: "2026-04-09T10:00:00+00:00",
      }],
    };

    const diffstatResponse = {
      values: [
        { lines_added: 50, lines_removed: 10, status: "modified" },
        { lines_added: 20, lines_removed: 5, status: "added" },
      ],
    };

    const statusResponse = {
      values: [
        { name: "Pipeline", state: "SUCCESSFUL", url: "https://bitbucket.org/pipeline/1", updated_on: "2026-04-09T11:00:00+00:00" },
        { name: "SonarQube", state: "SUCCESSFUL", url: "https://sonar.example.com", updated_on: "2026-04-09T11:05:00+00:00" },
      ],
    };

    const pipelineResponse = {
      values: [{
        uuid: "{pipe-1}",
        build_number: 42,
        state: { name: "COMPLETED", result: { name: "SUCCESSFUL" } },
        completed_on: "2026-04-09T11:00:00+00:00",
        links: { html: { href: "https://bitbucket.org/ws/repo/pipelines/results/42" } },
      }],
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      let body: unknown;
      if (url.includes("/refs/branches")) body = branchResponse;
      else if (url.includes("/diffstat")) body = diffstatResponse;
      else if (url.includes("/statuses")) body = statusResponse;
      else if (url.includes("/pullrequests")) body = prResponse;
      else if (url.includes("/pipelines")) body = pipelineResponse;
      else body = { values: [] };
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
      url: "https://bitbucket.org/ws/repo/branch/feature/VPL-42-dev-panel",
      lastCommit: {
        id: "abc123def456",
        message: "feat: add dev panel",
        date: "2026-04-09T10:00:00+00:00",
        author: "Thijs",
      },
    });

    expect(data.pullRequests).toHaveLength(1);
    const pr = data.pullRequests[0];
    expect(pr.id).toBe("77");
    expect(pr.title).toBe("VPL-42: Dev panel");
    expect(pr.status).toBe("OPEN");
    expect(pr.author).toBe("Thijs");
    expect(pr.reviewers).toEqual([{ name: "Alice", approved: true }]);
    expect(pr.sourceBranch).toBe("feature/VPL-42");
    expect(pr.destBranch).toBe("master");
    expect(pr.commentCount).toBe(3);
    expect(pr.taskCount).toBe(1);
    expect(pr.diffStats).toEqual({ filesChanged: 2, linesAdded: 70, linesRemoved: 15 });
    expect(pr.buildStatuses).toHaveLength(2);
    expect(pr.buildStatuses[0].name).toBe("Pipeline");
    expect(pr.buildStatuses[0].state).toBe("SUCCESSFUL");
    expect(pr.repo).toBe("my-repo");

    expect(data.commits).toHaveLength(1);
    expect(data.commits[0].id).toBe("abc123def456");

    expect(data.builds).toHaveLength(1);
    expect(data.builds[0]).toEqual({
      name: "Pipeline #42",
      url: "https://bitbucket.org/ws/repo/pipelines/results/42",
      state: "SUCCESSFUL",
      completedAt: "2026-04-09T11:00:00+00:00",
    });
  });

  it("returns empty arrays on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("Network failure");
    });

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [], deployments: [] });
  });

  it("handles non-OK Bitbucket responses gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("Forbidden", { status: 403 });
    });

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [], deployments: [] });
  });

  it("falls back to JIRA_EMAIL when BITBUCKET_EMAIL is not set", async () => {
    mockEnv.BITBUCKET_EMAIL = "";
    mockEnv.JIRA_EMAIL = "jira@example.com";

    const fetchHeaders: Record<string, string>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const h = init?.headers as Record<string, string> | undefined;
      if (h) fetchHeaders.push(h);
      return new Response(JSON.stringify({ values: [] }), { status: 200 });
    });

    await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );

    expect(fetchHeaders.length).toBeGreaterThan(0);
    const authHeader = fetchHeaders[0].Authorization;
    const decoded = Buffer.from(authHeader.replace("Basic ", ""), "base64").toString();
    expect(decoded.startsWith("jira@example.com:")).toBe(true);
  });

  it("normalises MERGED and DECLINED PR states", async () => {
    const prResponse = {
      values: [
        { id: 1, title: "VPL-42: merged", state: "MERGED", links: {}, author: { display_name: "A" }, participants: [] },
        { id: 2, title: "VPL-42: declined", state: "DECLINED", links: {}, author: { display_name: "B" }, participants: [] },
        { id: 3, title: "VPL-42: superseded", state: "SUPERSEDED", links: {}, author: { display_name: "C" }, participants: [] },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/pullrequests")) {
        return new Response(JSON.stringify(prResponse), { status: 200 });
      }
      return new Response(JSON.stringify({ values: [] }), { status: 200 });
    });

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );
    const data = await res.json();

    expect(data.pullRequests[0].status).toBe("MERGED");
    expect(data.pullRequests[1].status).toBe("DECLINED");
    expect(data.pullRequests[2].status).toBe("DECLINED");
  });
});
