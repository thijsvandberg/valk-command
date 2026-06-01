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

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs state=closed to the api.atlassian.com gateway, not the direct instance URL", async () => {
    await client.closeSprint(123);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.atlassian.com/ex/jira/cloud-123/rest/agile/1.0/sprint/123",
    );
    expect(url).not.toContain("new-story.atlassian.net");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ state: "closed" });
  });
});
