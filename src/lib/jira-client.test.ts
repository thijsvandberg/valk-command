// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { JiraClient, _requestTimestamps, filterDescriptionChanges, type ChangelogEntry } from "./jira-client";

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

  it("searchIssues returns empty array when not configured", async () => {
    const issues = await client.searchIssues("project = VPL");
    expect(issues).toEqual([]);
  });

  it("getDescriptionChangelog returns empty array when not configured", async () => {
    const changes = await client.getDescriptionChangelog("VPL-100");
    expect(changes).toEqual([]);
  });
});

describe("filterDescriptionChanges", () => {
  it("extracts description changes from mixed changelog items", () => {
    const entries: ChangelogEntry[] = [
      {
        author: { displayName: "Alice", avatarUrls: { "48x48": "https://example.com/alice.png" } },
        created: "2026-01-15T10:00:00.000+0000",
        items: [
          { field: "status", fieldtype: "jira", fromString: "To Do", toString: "In Progress" },
          { field: "description", fieldtype: "jira", fromString: "Old desc", toString: "New desc v1" },
        ],
      },
      {
        author: { displayName: "Bob", avatarUrls: { "48x48": "https://example.com/bob.png" } },
        created: "2026-01-16T12:00:00.000+0000",
        items: [
          { field: "summary", fieldtype: "jira", fromString: "Old title", toString: "New title" },
        ],
      },
      {
        author: { displayName: "Charlie" },
        created: "2026-01-17T09:00:00.000+0000",
        items: [
          { field: "description", fieldtype: "jira", fromString: "New desc v1", toString: "New desc v2" },
          { field: "Sprint", fieldtype: "custom", fromString: "Sprint 1", toString: "Sprint 2" },
        ],
      },
    ];

    const result = filterDescriptionChanges(entries);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      description: "New desc v1",
      author: "Alice",
      avatar: "https://example.com/alice.png",
      created: "2026-01-15T10:00:00.000+0000",
    });
    expect(result[1]).toEqual({
      description: "New desc v2",
      author: "Charlie",
      avatar: null,
      created: "2026-01-17T09:00:00.000+0000",
    });
  });

  it("returns empty array when no description changes exist", () => {
    const entries: ChangelogEntry[] = [
      {
        author: { displayName: "Alice" },
        created: "2026-01-15T10:00:00.000+0000",
        items: [
          { field: "status", fieldtype: "jira", fromString: "To Do", toString: "Done" },
        ],
      },
    ];

    expect(filterDescriptionChanges(entries)).toEqual([]);
  });

  it("skips description changes where toString is null", () => {
    const entries: ChangelogEntry[] = [
      {
        author: { displayName: "Alice" },
        created: "2026-01-15T10:00:00.000+0000",
        items: [
          { field: "description", fieldtype: "jira", fromString: "Some desc", toString: null },
        ],
      },
    ];

    expect(filterDescriptionChanges(entries)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(filterDescriptionChanges([])).toEqual([]);
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
