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

  it("preserves the existing dates when only the goal changes", async () => {
    // Jira's PUT nulls out omitted fields, so a goal-only update must re-send
    // the current startDate/endDate or they vanish.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 6361,
        name: "BT: 139",
        state: "future",
        startDate: "2026-07-03T00:00:00.000Z",
        endDate: "2026-07-16T17:00:00.000Z",
        goal: "Old goal",
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 6361 }));

    await client.updateSprint(6361, { goal: "Ship the thing" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const putCall = fetchMock.mock.calls[1];
    expect(putCall[1]?.method).toBe("PUT");
    expect(JSON.parse(putCall[1]?.body as string)).toEqual({
      name: "BT: 139",
      state: "future",
      startDate: "2026-07-03T00:00:00.000Z",
      endDate: "2026-07-16T17:00:00.000Z",
      goal: "Ship the thing",
    });
  });

  it("preserves the existing goal when only a date changes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 6361,
        name: "BT: 139",
        state: "future",
        endDate: "2026-07-16T17:00:00.000Z",
        goal: "Keep me",
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 6361 }));

    await client.updateSprint(6361, { startDate: "2026-07-03T00:00:00.000Z" });

    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      name: "BT: 139",
      state: "future",
      startDate: "2026-07-03T00:00:00.000Z",
      endDate: "2026-07-16T17:00:00.000Z",
      goal: "Keep me",
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

  it("lets an empty string clear a field instead of re-sending the old value", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        id: 6361,
        name: "BT: 139",
        state: "future",
        startDate: "2026-07-03T00:00:00.000Z",
        goal: "Old goal",
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 6361 }));

    await client.updateSprint(6361, { goal: "" });

    // goal omitted from payload => Jira nulls it; startDate preserved.
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      name: "BT: 139",
      state: "future",
      startDate: "2026-07-03T00:00:00.000Z",
    });
  });
});
