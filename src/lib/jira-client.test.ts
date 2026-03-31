import { describe, it, expect } from "vitest";
import { JiraClient } from "./jira-client";

describe("JiraClient (mock mode)", () => {
  const client = new JiraClient();

  it("isLive returns false when env vars are not set", () => {
    expect(client.isLive).toBe(false);
  });

  it("getSprints returns mock sprints", async () => {
    const sprints = await client.getSprints();
    expect(sprints.length).toBeGreaterThan(0);
    expect(sprints[0]).toHaveProperty("id");
    expect(sprints[0]).toHaveProperty("name");
    expect(sprints[0]).toHaveProperty("state");
  });

  it("getSprintIssues returns mock issues", async () => {
    const issues = await client.getSprintIssues(134);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toHaveProperty("key");
    expect(issues[0]).toHaveProperty("fields");
    expect(issues[0].fields).toHaveProperty("summary");
  });

  it("getIssue returns a specific mock issue", async () => {
    const issue = await client.getIssue("VPL-29223");
    expect(issue.key).toBe("VPL-29223");
    expect(issue.fields.summary).toContain("Kibana");
  });

  it("getIssue throws for unknown key", async () => {
    await expect(client.getIssue("FAKE-999")).rejects.toThrow("not found");
  });

  it("getComments returns empty array in mock mode", async () => {
    const comments = await client.getComments("VPL-29223");
    expect(comments).toEqual([]);
  });

  it("getAttachments returns empty array in mock mode", async () => {
    const attachments = await client.getAttachments("VPL-29223");
    expect(attachments).toEqual([]);
  });

  it("mock sprints include active, future, and closed states", async () => {
    const sprints = await client.getSprints();
    const states = new Set(sprints.map((s) => s.state));
    expect(states.has("active")).toBe(true);
    expect(states.has("future")).toBe(true);
    expect(states.has("closed")).toBe(true);
  });
});
