import { vi } from "vitest";

/**
 * Creates a mock for `@/lib/jira-client` suitable for `vi.mock()`.
 *
 * Usage:
 *   vi.mock("@/lib/jira-client", () => createJiraClientMock());
 *   vi.mock("@/lib/jira-client", () => createJiraClientMock({
 *     jiraClient: { getIssue: vi.fn().mockResolvedValue(customIssue) },
 *   }));
 */
export function createJiraClientMock(overrides?: {
  jiraClient?: Record<string, unknown>;
  isLive?: boolean;
  // Any top-level export can be overridden per test (e.g. extractSprint),
  // not just the jiraClient instance. These spread over the defaults below.
  [key: string]: unknown;
}) {
  const {
    jiraClient: jiraClientOverrides,
    isLive: isLiveOverride,
    ...topLevelOverrides
  } = overrides ?? {};
  const isLive = isLiveOverride ?? false;

  return {
    jiraClient: {
      // A writable data property (not a getter) so a test can reassign
      // jiraClient.isLive at runtime without a TypeError in strict-mode ESM.
      isLive,
      getSprints: vi.fn().mockResolvedValue([]),
      getSprintsLightweight: vi.fn().mockResolvedValue([]),
      getSprintIssues: vi.fn().mockResolvedValue([]),
      getSprint: vi.fn().mockResolvedValue({ id: 0, name: "Sprint", state: "future" }),
      getIssue: vi.fn().mockResolvedValue({
        fields: { updated: new Date().toISOString() },
      }),
      getComments: vi.fn().mockResolvedValue([]),
      addComment: vi.fn().mockResolvedValue(undefined),
      addFlagComment: vi.fn().mockResolvedValue(undefined),
      getAttachments: vi.fn().mockResolvedValue([]),
      checkHealth: vi
        .fn()
        .mockResolvedValue({
          displayName: "Test User",
          emailAddress: "test@example.com",
        }),
      getSprintIssueTimestamps: vi.fn().mockResolvedValue([]),
      getEpicIssueTimestamps: vi.fn().mockResolvedValue([]),
      getIssuesByKeys: vi.fn().mockResolvedValue([]),
      getIssueLinksByKeys: vi.fn().mockResolvedValue([]),
      getLastChangeAuthor: vi.fn().mockResolvedValue(null),
      transitionIssue: vi.fn().mockResolvedValue(undefined),
      updateIssue: vi.fn().mockResolvedValue(undefined),
      rankIssues: vi.fn().mockResolvedValue(undefined),
      moveToSprint: vi.fn().mockResolvedValue(undefined),
      moveToBacklog: vi.fn().mockResolvedValue(undefined),
      getBacklogIssues: vi.fn().mockResolvedValue([]),
      getBacklogIssueTimestamps: vi.fn().mockResolvedValue([]),
      updateSprint: vi.fn().mockResolvedValue(undefined),
      createSprint: vi
        .fn()
        .mockResolvedValue({ id: 999, name: "New Sprint", state: "future" }),
      assignIssue: vi.fn().mockResolvedValue(undefined),
      getAssignableUsers: vi.fn().mockResolvedValue([]),
      createIssue: vi
        .fn()
        .mockResolvedValue({ key: "VPL-999", id: "99999" }),
      getUpdatedSince: vi.fn().mockResolvedValue([]),
      searchIssues: vi.fn().mockResolvedValue([]),
      searchAllIssues: vi.fn().mockResolvedValue([]),
      getIssueLinkTypes: vi.fn().mockResolvedValue([
        {
          id: "1",
          name: "Relates",
          inward: "relates to",
          outward: "relates to",
        },
        {
          id: "2",
          name: "Blocks",
          inward: "is blocked by",
          outward: "blocks",
        },
      ]),
      createIssueLink: vi.fn().mockResolvedValue(undefined),
      deleteIssueLink: vi.fn().mockResolvedValue(undefined),
      getDescriptionChangelog: vi.fn().mockResolvedValue([]),
      getStatusChangelog: vi.fn().mockResolvedValue([]),
      getBurnupChangelog: vi
        .fn()
        .mockResolvedValue({ statusChanges: [], sprintChanges: [] }),
      getLabels: vi.fn().mockResolvedValue([]),
      ...jiraClientOverrides,
    },
    ISSUE_FIELDS: "summary,issuetype,status,priority,assignee",
    SPRINT_FIELD: "customfield_10007",
    STORY_POINTS_FIELD: "customfield_11909",
    ACCEPTANCE_CRITERIA_FIELD: "customfield_10034",
    FLAGGED_FIELD: "customfield_10002",
    extractSprint: vi.fn().mockReturnValue(null),
    extractSprints: vi.fn().mockReturnValue([]),
    extractStoryPoints: vi.fn().mockReturnValue(null),
    extractEpicLink: vi.fn().mockReturnValue(null),
    extractAcceptanceCriteria: vi.fn().mockReturnValue(null),
    extractLastChangeAuthor: vi.fn().mockReturnValue(null),
    extractLastStatusChangeAuthor: vi.fn().mockReturnValue(null),
    extractLastSprintChangeAuthor: vi.fn().mockReturnValue(null),
    filterDescriptionChanges: vi.fn().mockReturnValue([]),
    filterStatusChanges: vi.fn().mockReturnValue([]),
    filterSprintChanges: vi.fn().mockReturnValue([]),
    // Pure helpers / test hooks. Stubbed so a full module mock never leaves a
    // real export undefined; safe defaults that no current test depends on.
    redactJiraPath: vi.fn((path: string) => path),
    issuePath: vi.fn((key: string, suffix = "") => `/rest/api/3/issue/${key}${suffix}`),
    selectPrimarySprint: vi.fn().mockReturnValue(null),
    _resetRateWarn: vi.fn(),
    _noteRateLimitApproaching: vi.fn(),
    _requestTimestamps: [] as number[],
    JiraClient: class JiraClient {},
    JiraApiError: class JiraApiError extends Error {
      status: number;
      statusText: string;
      responseBody: string;
      path: string;
      constructor(
        status: number,
        statusText = "Error",
        responseBody = "",
        path = "",
      ) {
        super(`Jira API ${status}: ${statusText}`);
        this.name = "JiraApiError";
        this.status = status;
        this.statusText = statusText;
        this.responseBody = responseBody;
        this.path = path;
      }
    },
    // Per-test overrides of top-level exports win over the defaults above.
    ...topLevelOverrides,
  };
}
