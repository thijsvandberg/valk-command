// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";

// Configure Jira so the rank methods pass their isConfigured() guard. Kept in a separate
// file from jira-client.test.ts, which deliberately exercises the unconfigured path.
vi.mock("@/lib/env", () => ({
  env: {
    JIRA_CLOUD_ID: "cloud-1",
    JIRA_BASE_URL: "",
    JIRA_EMAIL: "po@example.com",
    JIRA_API_TOKEN: "token",
    JIRA_PROJECT_KEY: "VPL",
    JIRA_BOARD_ID: "1",
  },
}));

import { JiraClient } from "./jira-client";

describe("rankToBottomOfSprint places above the finished block (BRDG-315/371)", () => {
  let client: JiraClient;

  beforeEach(() => {
    client = new JiraClient();
  });

  it("ranks the new issue after the last still-active issue", async () => {
    const search = vi
      .spyOn(client, "searchIssues")
      .mockResolvedValue([{ key: "VPL-ACTIVE" }] as never);
    const rank = vi.spyOn(client, "rankIssues").mockResolvedValue(undefined as never);

    await client.rankToBottomOfSprint(["VPL-100"], 42);

    const jql = search.mock.calls[0][0];
    expect(jql).toContain("statusCategory != Done");
    expect(jql).toContain("ORDER BY rank DESC");
    expect(jql).toContain("key NOT IN (VPL-100)");
    expect(rank).toHaveBeenCalledWith(["VPL-100"], undefined, "VPL-ACTIVE", undefined);
  });

  it("falls back to ranking above the finished block when no active issues remain", async () => {
    const search = vi
      .spyOn(client, "searchIssues")
      .mockResolvedValueOnce([] as never) // no active issue
      .mockResolvedValueOnce([{ key: "VPL-DONE" }] as never); // first finished issue
    const rank = vi.spyOn(client, "rankIssues").mockResolvedValue(undefined as never);

    await client.rankToBottomOfSprint(["VPL-100"], 42);

    expect(search.mock.calls[1][0]).toContain("ORDER BY rank ASC");
    expect(rank).toHaveBeenCalledWith(["VPL-100"], "VPL-DONE", undefined, undefined);
  });

  it("does nothing when the sprint has no other issues", async () => {
    vi.spyOn(client, "searchIssues").mockResolvedValue([] as never);
    const rank = vi.spyOn(client, "rankIssues").mockResolvedValue(undefined as never);

    await client.rankToBottomOfSprint(["VPL-100"], 42);

    expect(rank).not.toHaveBeenCalled();
  });
});
