// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// addComment only runs when Jira is configured, and getConfig reads the parsed
// `env`. Mock it as configured here (a separate file from jira-client.test.ts,
// which deliberately exercises the unconfigured path with an empty env).
vi.mock("@/lib/env", () => ({
  env: {
    JIRA_CLOUD_ID: "",
    JIRA_BASE_URL: "https://example.atlassian.net",
    JIRA_EMAIL: "po@example.com",
    JIRA_API_TOKEN: "token-123",
    JIRA_PROJECT_KEY: "VPL",
    JIRA_BOARD_ID: "",
  },
}));

import { JiraClient } from "./jira-client";

describe("JiraClient.addComment ADF formatting (BRDG-435)", () => {
  const client = new JiraClient();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        id: "100",
        author: { displayName: "PO", avatarUrls: { "48x48": "a.png" } },
        body: { type: "doc", version: 1, content: [] },
        created: "2026-06-29T00:00:00.000Z",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function postedAdf(): { type: string; content: { type: string }[] } {
    const init = fetchMock.mock.calls[0][1] as { body: string };
    return JSON.parse(init.body).body;
  }

  it("converts markdown headings, lists and code blocks into rich ADF nodes", async () => {
    await client.addComment(
      "VPL-1",
      "# Findings\n\n- item one\n- item two\n\n```\nconst x = 1;\n```",
    );

    const adf = postedAdf();
    const types = adf.content.map((n) => n.type);

    expect(adf.type).toBe("doc");
    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    expect(types).toContain("codeBlock");
  });

  it("does not flatten formatted markdown into plain paragraphs only", async () => {
    await client.addComment("VPL-1", "# Heading\n\n- bullet");

    const types = postedAdf().content.map((n) => n.type);
    expect(types.every((t) => t === "paragraph")).toBe(false);
  });

  it("posts to the issue comment endpoint", async () => {
    await client.addComment("VPL-1", "plain text");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/rest/api/3/issue/VPL-1/comment");
  });
});
