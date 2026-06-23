// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Configure the env so the client treats itself as live. Mock is hoisted above
// the jira-client import, so getConfig() sees these values.
vi.mock("@/lib/env", () => ({
  env: {
    JIRA_CLOUD_ID: "cloud-1",
    JIRA_BASE_URL: "https://example.atlassian.net",
    JIRA_EMAIL: "po@example.com",
    JIRA_API_TOKEN: "token-1",
    JIRA_PROJECT_KEY: "VPL",
    JIRA_BOARD_ID: "233",
  },
}));

import { JiraClient } from "./jira-client";

type FetchArgs = { url: string; body: unknown };

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 400 ? "Bad Request" : "OK",
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

describe("JiraClient.createIssue subtask type", () => {
  const client = new JiraClient();
  let calls: FetchArgs[];

  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(responses: Response[]) {
    let i = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return responses[i++];
    }));
  }

  function issueTypeOf(call: FetchArgs): string {
    return (call.body as { fields: { issuetype: { name: string } } }).fields.issuetype.name;
  }

  it("creates a subtask with issue type 'Subtask' on the first attempt", async () => {
    mockFetch([jsonResponse(200, { id: "1", key: "VPL-2" })]);

    const result = await client.createIssue({ summary: "Child", parentKey: "VPL-1", projectKey: "VPL" });

    expect(result).toEqual({ id: "1", key: "VPL-2" });
    expect(calls).toHaveLength(1);
    expect(issueTypeOf(calls[0])).toBe("Subtask");
  });

  it("falls back to 'Sub-task' when a classic project rejects 'Subtask'", async () => {
    mockFetch([
      jsonResponse(400, { errors: { issuetype: "Specify a valid issue type" } }),
      jsonResponse(200, { id: "9", key: "VPL-9" }),
    ]);

    const result = await client.createIssue({ summary: "Child", parentKey: "VPL-1", projectKey: "VPL" });

    expect(result).toEqual({ id: "9", key: "VPL-9" });
    expect(calls).toHaveLength(2);
    expect(issueTypeOf(calls[0])).toBe("Subtask");
    expect(issueTypeOf(calls[1])).toBe("Sub-task");
  });

  it("includes the parent key on the subtask body", async () => {
    mockFetch([jsonResponse(200, { id: "1", key: "VPL-2" })]);

    await client.createIssue({ summary: "Child", parentKey: "VPL-1", projectKey: "VPL" });

    expect((calls[0].body as { fields: { parent: { key: string } } }).fields.parent.key).toBe("VPL-1");
  });

  it("uses 'Story' (no fallback) when no parent key is given", async () => {
    mockFetch([jsonResponse(200, { id: "1", key: "VPL-3" })]);

    await client.createIssue({ summary: "Top-level", projectKey: "VPL" });

    expect(calls).toHaveLength(1);
    expect(issueTypeOf(calls[0])).toBe("Story");
  });
});
