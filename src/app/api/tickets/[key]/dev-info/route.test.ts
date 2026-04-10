import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// DB mock not needed - route no longer queries DB
import { GET } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

describe("GET /api/tickets/[key]/dev-info", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.BITBUCKET_WORKSPACE = "my-workspace";
    process.env.BITBUCKET_REPO_SLUG = "my-repo";
    process.env.BITBUCKET_EMAIL = "test@example.com";
    process.env.BITBUCKET_APP_PASSWORD = "test-password";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns empty arrays when Bitbucket is not configured", async () => {
    delete process.env.BITBUCKET_WORKSPACE;
    delete process.env.BITBUCKET_REPO_SLUG;

    const res = await GET(
      new Request("http://localhost:3100/api/tickets/VPL-1/dev-info"),
      makeParams("VPL-1"),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
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
      }],
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
    expect(data.pullRequests[0]).toEqual({
      id: "77",
      title: "VPL-42: Dev panel",
      url: "https://bitbucket.org/ws/repo/pull-requests/77",
      status: "OPEN",
      author: "Thijs",
      reviewers: ["Alice"],
    });

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
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
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
    expect(data).toEqual({ branches: [], pullRequests: [], commits: [], builds: [] });
  });

  it("falls back to JIRA_EMAIL when BITBUCKET_EMAIL is not set", async () => {
    delete process.env.BITBUCKET_EMAIL;
    process.env.JIRA_EMAIL = "jira@example.com";

    const fetchUrls: string[] = [];
    const fetchHeaders: Record<string, string>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      fetchUrls.push(typeof input === "string" ? input : input.toString());
      const h = init?.headers as Record<string, string> | undefined;
      if (h) fetchHeaders.push(h);
      return new Response(JSON.stringify({ values: [] }), { status: 200 });
    });

    await GET(
      new Request("http://localhost:3100/api/tickets/VPL-42/dev-info"),
      makeParams("VPL-42"),
    );

    expect(fetchHeaders.length).toBeGreaterThan(0);
    // Auth header should use jira email as fallback
    const authHeader = fetchHeaders[0].Authorization;
    const decoded = Buffer.from(authHeader.replace("Basic ", ""), "base64").toString();
    expect(decoded.startsWith("jira@example.com:")).toBe(true);
  });

  it("normalises MERGED and DECLINED PR states", async () => {
    const prResponse = {
      values: [
        { id: 1, title: "VPL-42: merged", state: "MERGED", links: {}, author: { display_name: "A" }, reviewers: [] },
        { id: 2, title: "VPL-42: declined", state: "DECLINED", links: {}, author: { display_name: "B" }, reviewers: [] },
        { id: 3, title: "VPL-42: superseded", state: "SUPERSEDED", links: {}, author: { display_name: "C" }, reviewers: [] },
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
