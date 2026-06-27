// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JiraClient, issuePath, JiraApiError, _requestTimestamps, filterDescriptionChanges, filterStatusChanges, extractLastStatusChangeAuthor, extractSprint, extractSprints, selectPrimarySprint, SPRINT_FIELD, ISSUE_FIELDS, redactJiraPath, _noteRateLimitApproaching, _resetRateWarn, type ChangelogEntry, type JiraSprint, type JiraIssueFields, type JiraIssue } from "./jira-client";

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

  // BRDG-409: rank methods interpolate keys into a `key NOT IN (...)` JQL clause.
  // A malformed key is rejected before the clause is built (defense in depth),
  // independent of whether Jira is configured.
  it("rankToTopOfSprint rejects a malformed issue key", async () => {
    await expect(client.rankToTopOfSprint(["VPL-1", "bad) OR 1=1"], 134)).rejects.toThrow(/Invalid Jira issue key/);
  });

  it("rankToBottomOfBacklog rejects a malformed issue key", async () => {
    await expect(client.rankToBottomOfBacklog(["../secret"])).rejects.toThrow(/Invalid Jira issue key/);
  });

  it("rank methods are a safe no-op for valid keys when unconfigured", async () => {
    await expect(client.rankToTopOfSprint(["VPL-1"], 134)).resolves.toBeUndefined();
  });
});

describe("issuePath", () => {
  it("builds an encoded /issue path for a valid key", () => {
    expect(issuePath("VPL-123")).toBe("/rest/api/3/issue/VPL-123");
    expect(issuePath("VPL-123", "/comment")).toBe("/rest/api/3/issue/VPL-123/comment");
    expect(issuePath("vpl-1", "?fields=summary")).toBe("/rest/api/3/issue/vpl-1?fields=summary");
  });

  it("rejects keys that would inject extra path/query segments", () => {
    expect(() => issuePath("VPL-1/transitions")).toThrow(JiraApiError);
    expect(() => issuePath("VPL-1?expand=changelog")).toThrow(JiraApiError);
    expect(() => issuePath("VPL-1#frag")).toThrow(JiraApiError);
    expect(() => issuePath("../../secret")).toThrow(JiraApiError);
    expect(() => issuePath("VPL-1&foo=bar")).toThrow(JiraApiError);
  });

  it("throws a 400 JiraApiError for malformed keys", () => {
    try {
      issuePath("not a key");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(JiraApiError);
      expect((err as JiraApiError).status).toBe(400);
    }
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

describe("filterStatusChanges (BRDG-414)", () => {
  it("retains the author, accountId and avatar of each status change", () => {
    const entries: ChangelogEntry[] = [
      {
        author: { displayName: "Carol Smit", accountId: "acc-carol", avatarUrls: { "48x48": "https://example.com/carol.png" } },
        created: "2026-01-15T10:00:00.000+0000",
        items: [
          { field: "status", fieldtype: "jira", fromString: "To Do", toString: "In Progress" },
          { field: "description", fieldtype: "jira", fromString: "a", toString: "b" },
        ],
      },
      {
        // No accountId on this author (older entry / hidden user).
        author: { displayName: "Bob" },
        created: "2026-01-16T12:00:00.000+0000",
        items: [{ field: "status", fieldtype: "jira", fromString: "In Progress", toString: "Done" }],
      },
    ];

    const result = filterStatusChanges(entries);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      fromStatus: "To Do",
      toStatus: "In Progress",
      changedAt: "2026-01-15T10:00:00.000+0000",
      author: "Carol Smit",
      authorAccountId: "acc-carol",
      authorAvatar: "https://example.com/carol.png",
    });
    expect(result[1].author).toBe("Bob");
    expect(result[1].authorAccountId).toBeNull();
    expect(result[1].authorAvatar).toBeNull();
  });

  it("ignores non-status changes", () => {
    const entries: ChangelogEntry[] = [
      {
        author: { displayName: "Alice" },
        created: "2026-01-15T10:00:00.000+0000",
        items: [{ field: "summary", fieldtype: "jira", fromString: "x", toString: "y" }],
      },
    ];
    expect(filterStatusChanges(entries)).toEqual([]);
  });
});

describe("extractLastStatusChangeAuthor (BRDG-414)", () => {
  function issueWith(histories: NonNullable<JiraIssue["changelog"]>["histories"]): JiraIssue {
    return { id: "1", key: "VPL-1", fields: {} as JiraIssueFields, changelog: { histories } };
  }

  it("returns the latest status transition (histories are newest-first)", () => {
    const issue = issueWith([
      {
        author: { displayName: "Carol Smit", accountId: "acc-carol", avatarUrls: { "48x48": "carol.png" } },
        created: "2026-02-02T10:00:00.000+0000",
        items: [{ field: "status", fromString: "In Progress", toString: "Test" }],
      },
      {
        author: { displayName: "Dan" },
        created: "2026-02-01T09:00:00.000+0000",
        items: [{ field: "status", fromString: "To Do", toString: "In Progress" }],
      },
    ]);
    expect(extractLastStatusChangeAuthor(issue)).toEqual({
      name: "Carol Smit",
      accountId: "acc-carol",
      avatar: "carol.png",
      changedAt: "2026-02-02T10:00:00.000+0000",
    });
  });

  it("skips non-status histories and returns null when there is no status change", () => {
    const issue = issueWith([
      {
        author: { displayName: "Dan" },
        created: "2026-02-01T09:00:00.000+0000",
        items: [{ field: "assignee", fromString: null as unknown as string, toString: "Dan" }],
      },
    ]);
    expect(extractLastStatusChangeAuthor(issue)).toBeNull();
  });

  it("returns null when there is no changelog", () => {
    expect(extractLastStatusChangeAuthor({ id: "1", key: "VPL-1", fields: {} as JiraIssueFields })).toBeNull();
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

describe("redactJiraPath", () => {
  it("collapses the long static fields= list to a count", () => {
    const path = `/rest/api/3/issue/VPL-1?fields=${ISSUE_FIELDS}`;
    const redacted = redactJiraPath(path);
    expect(redacted).not.toContain(ISSUE_FIELDS);
    expect(redacted).toMatch(/fields=<\d+ fields>/);
    // The issue key and the rest of the path are preserved.
    expect(redacted).toContain("/rest/api/3/issue/VPL-1?");
  });

  it("collapses a url-encoded fields list too", () => {
    const path = `/rest/api/3/search/jql?jql=x&fields=${encodeURIComponent(ISSUE_FIELDS)}&maxResults=100`;
    const redacted = redactJiraPath(path);
    expect(redacted).toMatch(/fields=<\d+ fields>/);
    // Trailing query params after the fields value are kept.
    expect(redacted).toContain("&maxResults=100");
  });

  it("leaves a short single-field value untouched", () => {
    expect(redactJiraPath("/rest/api/3/issue/VPL-1?fields=summary")).toBe(
      "/rest/api/3/issue/VPL-1?fields=summary",
    );
  });

  it("is a no-op when there is no fields= segment", () => {
    expect(redactJiraPath("/rest/api/3/issue/VPL-1/comment")).toBe(
      "/rest/api/3/issue/VPL-1/comment",
    );
  });
});

describe("Jira rate-limit warn throttling", () => {
  beforeEach(() => {
    _resetRateWarn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetRateWarn();
  });

  function warnCount(): number {
    return (console.warn as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes("Approaching Jira API rate limit"),
    ).length;
  }

  it("warns on the first hit of a window", () => {
    _noteRateLimitApproaching(1_000);
    expect(warnCount()).toBe(1);
  });

  it("suppresses repeated hits within the same window instead of one line per call", () => {
    const base = 1_000;
    // 20 hits inside the 60s window: still only the single opening warn.
    for (let i = 0; i < 20; i++) _noteRateLimitApproaching(base + i);
    expect(warnCount()).toBe(1);
  });

  it("emits an aggregated count line every 25th suppressed hit", () => {
    const base = 1_000;
    // 25 hits: opening warn (#1) + the aggregate at the 25th.
    for (let i = 0; i < 25; i++) _noteRateLimitApproaching(base + i);
    expect(warnCount()).toBe(2);
    const aggregate = (console.warn as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .find((l) => /x\d+ in the last/.test(l));
    expect(aggregate).toContain("x25");
  });

  it("opens a new window (and warns again) after the window elapses", () => {
    _noteRateLimitApproaching(1_000);
    _noteRateLimitApproaching(2_000);
    expect(warnCount()).toBe(1);
    // 60s later a fresh window starts and warns immediately.
    _noteRateLimitApproaching(1_000 + 60_000);
    expect(warnCount()).toBe(2);
  });
});
