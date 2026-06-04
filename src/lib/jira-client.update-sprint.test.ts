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

describe("JiraClient.updateSprint", () => {
  const client = new JiraClient();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always sends the current name and state, merging changed fields on top", async () => {
    // 1: GET current sprint, 2: PUT the merged payload
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 6361, name: "BT: 139", state: "future" }))
      .mockResolvedValueOnce(jsonResponse({ id: 6361 }));

    await client.updateSprint(6361, { goal: "Ship the thing" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const putCall = fetchMock.mock.calls[1];
    expect(putCall[1]?.method).toBe("PUT");
    expect(JSON.parse(putCall[1]?.body as string)).toEqual({
      name: "BT: 139",
      state: "future",
      goal: "Ship the thing",
    });
  });

  it("lets a changed name override the fetched name", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 6361, name: "BT: 139", state: "future" }))
      .mockResolvedValueOnce(jsonResponse({ id: 6361 }));

    await client.updateSprint(6361, { name: "BT: 140", startDate: "2026-06-05T00:00:00.000Z" });

    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      name: "BT: 140",
      state: "future",
      startDate: "2026-06-05T00:00:00.000Z",
    });
  });
});
