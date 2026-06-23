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

const SPRINT_FIELD = "customfield_10007";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function searchResponseForSprint(sprint: Record<string, unknown>): Response {
  return jsonResponse({
    issues: [{ key: "VPL-1", fields: { [SPRINT_FIELD]: [sprint] } }],
    isLast: true,
  });
}

describe("JiraClient.getSprints goal enrichment", () => {
  const client = new JiraClient();
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips the per-sprint goal fetch when goal is already known", async () => {
    fetchMock.mockResolvedValueOnce(
      searchResponseForSprint({ id: 42, name: "Sprint 42", state: "active", boardId: 1, goal: "Ship it" }),
    );

    const sprints = await client.getSprints(["active"]);

    // Only the JQL search ran; no /rest/agile/1.0/sprint enrichment call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sprints[0].goal).toBe("Ship it");
  });

  it("fetches the goal via the Agile API when it is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(
        searchResponseForSprint({ id: 42, name: "Sprint 42", state: "active", boardId: 1 }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 42, goal: "Fetched goal" }));

    const sprints = await client.getSprints(["active"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("/rest/agile/1.0/sprint/42");
    expect(sprints[0].goal).toBe("Fetched goal");
  });
});
