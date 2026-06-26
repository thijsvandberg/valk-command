// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Provide Jira credentials so the client runs in configured mode.
vi.mock("@/lib/env", () => ({
  env: {
    JIRA_CLOUD_ID: "test-cloud",
    JIRA_BASE_URL: "",
    JIRA_EMAIL: "po@example.com",
    JIRA_API_TOKEN: "token",
    JIRA_PROJECT_KEY: "VPL",
    JIRA_BOARD_ID: "1",
  },
}));

import { JiraClient } from "./jira-client";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Pull the decoded JQL out of a /search/jql request URL.
function jqlOf(url: string): string {
  const m = url.match(/[?&]jql=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

describe("JiraClient.getIssuesByKeys chunking (BRDG-408)", () => {
  const client = new JiraClient();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns [] for an empty key list without issuing a request", async () => {
    const result = await client.getIssuesByKeys([]);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("splits >100 keys into bounded `key in (...)` queries and concatenates results", async () => {
    const keys = Array.from({ length: 250 }, (_, i) => `VPL-${i + 1}`);

    // Each chunk responds with its own keys as issues so we can assert concatenation.
    fetchMock.mockImplementation((url: string) => {
      const jql = jqlOf(url);
      const inList = jql.slice(jql.indexOf("(") + 1, jql.lastIndexOf(")"));
      const chunkKeys = inList.split(",");
      return Promise.resolve(
        jsonResponse({ issues: chunkKeys.map((k) => ({ key: k, fields: {} })), isLast: true }),
      );
    });

    const result = await client.getIssuesByKeys(keys);

    // 250 keys at a 100-key chunk size => 3 bounded queries (100 + 100 + 50).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      const inList = jqlOf(call[0] as string);
      const count = inList.slice(inList.indexOf("(") + 1, inList.lastIndexOf(")")).split(",").length;
      expect(count).toBeLessThanOrEqual(100);
    }

    // All 250 issues are concatenated, in input order.
    expect(result.map((i) => i.key)).toEqual(keys);
  });

  it("expands the changelog only when requested", async () => {
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ issues: [{ key: "VPL-1", fields: {} }], isLast: true })),
    );

    await client.getIssuesByKeys(["VPL-1"], undefined, true);
    expect((fetchMock.mock.calls[0][0] as string)).toContain("expand=changelog");

    fetchMock.mockClear();
    await client.getIssuesByKeys(["VPL-1"]);
    expect((fetchMock.mock.calls[0][0] as string)).not.toContain("expand=changelog");
  });
});
