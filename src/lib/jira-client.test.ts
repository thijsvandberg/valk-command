import { describe, it, expect, beforeEach } from "vitest";
import { JiraClient, _requestTimestamps } from "./jira-client";

describe("JiraClient (unconfigured mode)", () => {
  const client = new JiraClient();

  it("isLive returns false when env vars are not set", () => {
    expect(client.isLive).toBe(false);
  });

  it("getSprints returns empty array when not configured", async () => {
    const sprints = await client.getSprints();
    expect(sprints).toEqual([]);
  });

  it("getSprintIssues returns empty array when not configured", async () => {
    const issues = await client.getSprintIssues(134);
    expect(issues).toEqual([]);
  });

  it("getIssue throws when not configured", async () => {
    await expect(client.getIssue("VPL-29223")).rejects.toThrow("not configured");
  });

  it("getComments returns empty array when not configured", async () => {
    const comments = await client.getComments("VPL-29223");
    expect(comments).toEqual([]);
  });

  it("getAttachments returns empty array when not configured", async () => {
    const attachments = await client.getAttachments("VPL-29223");
    expect(attachments).toEqual([]);
  });

  it("getSprintIssueTimestamps returns empty array when not configured", async () => {
    const timestamps = await client.getSprintIssueTimestamps(134);
    expect(timestamps).toEqual([]);
  });

  it("getIssuesByKeys returns empty array when not configured", async () => {
    const issues = await client.getIssuesByKeys(["VPL-29223"]);
    expect(issues).toEqual([]);
  });
});

describe("Rate limiter", () => {
  beforeEach(() => {
    _requestTimestamps.length = 0;
  });

  it("exposes request timestamps array for tracking", () => {
    expect(Array.isArray(_requestTimestamps)).toBe(true);
    expect(_requestTimestamps.length).toBe(0);
  });

  it("timestamps array is empty on init", () => {
    expect(_requestTimestamps).toEqual([]);
  });
});
