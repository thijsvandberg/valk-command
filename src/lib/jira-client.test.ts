// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { JiraClient, _requestTimestamps, filterDescriptionChanges, extractSprint, extractSprints, selectPrimarySprint, SPRINT_FIELD, type ChangelogEntry, type JiraSprint, type JiraIssueFields } from "./jira-client";

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

  it("getWatchers returns empty array when not configured", async () => {
    const watchers = await client.getWatchers("VPL-100");
    expect(watchers).toEqual([]);
  });

  it("addWatcher throws when not configured", async () => {
    await expect(client.addWatcher("VPL-100", "acc-1")).rejects.toThrow("not configured");
  });

  it("removeWatcher throws when not configured", async () => {
    await expect(client.removeWatcher("VPL-100", "acc-1")).rejects.toThrow("not configured");
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

function fieldsWithSprints(sprints: JiraSprint[]): JiraIssueFields {
  return { [SPRINT_FIELD]: sprints } as unknown as JiraIssueFields;
}

const ACTIVE: JiraSprint = { id: 2, name: "Active", state: "active", startDate: "2026-05-01T00:00:00.000Z" };
const FUTURE_EARLY: JiraSprint = { id: 3, name: "Future early", state: "future", startDate: "2026-06-01T00:00:00.000Z" };
const FUTURE_LATE: JiraSprint = { id: 4, name: "Future late", state: "future", startDate: "2026-07-01T00:00:00.000Z" };
const CLOSED_OLD: JiraSprint = { id: 5, name: "Closed old", state: "closed", completeDate: "2026-01-01T00:00:00.000Z" };
const CLOSED_RECENT: JiraSprint = { id: 6, name: "Closed recent", state: "closed", completeDate: "2026-04-01T00:00:00.000Z" };

describe("selectPrimarySprint", () => {
  it("returns null for an empty list", () => {
    expect(selectPrimarySprint([])).toBeNull();
  });

  it("prefers the active sprint over future and closed", () => {
    expect(selectPrimarySprint([CLOSED_RECENT, FUTURE_EARLY, ACTIVE])?.id).toBe(ACTIVE.id);
  });

  it("falls back to the soonest future sprint when none are active", () => {
    expect(selectPrimarySprint([FUTURE_LATE, CLOSED_RECENT, FUTURE_EARLY])?.id).toBe(FUTURE_EARLY.id);
  });

  it("falls back to the most recently completed sprint when all are closed", () => {
    expect(selectPrimarySprint([CLOSED_OLD, CLOSED_RECENT])?.id).toBe(CLOSED_RECENT.id);
  });
});

describe("extractSprint", () => {
  it("returns null when the issue has no sprint", () => {
    expect(extractSprint({} as JiraIssueFields)).toBeNull();
    expect(extractSprint(fieldsWithSprints([]))).toBeNull();
  });

  it("returns the active sprint even when a closed sprint comes later in the array", () => {
    // Reproduces VPL-29223: closed Sprint 115 was last in the array and used to win.
    expect(extractSprint(fieldsWithSprints([ACTIVE, CLOSED_RECENT]))?.id).toBe(ACTIVE.id);
  });
});

describe("extractSprints", () => {
  it("returns an empty array when the field is absent", () => {
    expect(extractSprints({} as JiraIssueFields)).toEqual([]);
  });

  it("returns every sprint in original order", () => {
    expect(extractSprints(fieldsWithSprints([CLOSED_OLD, ACTIVE])).map((s) => s.id)).toEqual([CLOSED_OLD.id, ACTIVE.id]);
  });

  it("dedupes by id", () => {
    expect(extractSprints(fieldsWithSprints([ACTIVE, ACTIVE, CLOSED_OLD])).map((s) => s.id)).toEqual([ACTIVE.id, CLOSED_OLD.id]);
  });
});
