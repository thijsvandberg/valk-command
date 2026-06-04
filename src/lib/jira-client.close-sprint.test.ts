// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Configured-mode env so isConfigured() passes and the API gateway base URL is used.
vi.mock("./env", () => ({
  env: {
    JIRA_CLOUD_ID: "cloud-123",
    JIRA_BASE_URL: "https://new-story.atlassian.net",
    JIRA_EMAIL: "po@example.com",
    JIRA_API_TOKEN: "token-abc",
    JIRA_PROJECT_KEY: "VPL",
    JIRA_BOARD_ID: "233",
  },
}));

import { JiraClient } from "./jira-client";

describe("JiraClient.closeSprint", () => {
  const client = new JiraClient();
  let fetchMock: ReturnType<typeof vi.fn>;

  const currentSprint = {
    id: 123,
    name: "VPL Sprint 42",
    state: "active",
    startDate: "2026-05-08T09:00:00.000Z",
    endDate: "2026-05-21T17:00:00.000Z",
    goal: "Ship the thing",
    completeDate: undefined,
    originBoardId: 233,
  };

  beforeEach(() => {
    // closeSprint first GETs the current sprint, then PUTs the merged payload.
    fetchMock = vi.fn().mockImplementation((_url: string, init?: { method?: string }) => {
      if (init?.method === "PUT") {
        return Promise.resolve({ ok: true, status: 204, text: async () => "" });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => currentSprint,
        text: async () => JSON.stringify(currentSprint),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const gatewayUrl =
    "https://api.atlassian.com/ex/jira/cloud-123/rest/agile/1.0/sprint/123";

  it("GETs the current sprint then PUTs a full merged payload to the gateway", async () => {
    await client.closeSprint(123);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [getUrl, getInit] = fetchMock.mock.calls[0];
    expect(getUrl).toBe(gatewayUrl);
    expect(getInit.method).toBeUndefined();

    const [putUrl, putInit] = fetchMock.mock.calls[1];
    expect(putUrl).toBe(gatewayUrl);
    expect(putUrl).not.toContain("new-story.atlassian.net");
    expect(putInit.method).toBe("PUT");
    // Re-sends name/dates/goal (Jira's PUT is a full update) with state flipped to closed,
    // and never echoes read-only fields like completeDate / originBoardId.
    expect(JSON.parse(putInit.body)).toEqual({
      name: "VPL Sprint 42",
      state: "closed",
      startDate: "2026-05-08T09:00:00.000Z",
      endDate: "2026-05-21T17:00:00.000Z",
      goal: "Ship the thing",
    });
  });
});
