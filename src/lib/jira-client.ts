/**
 * Jira REST API client.
 *
 * When JIRA_BASE_URL / JIRA_API_TOKEN are set the client talks to the real
 * Jira Cloud REST API v3.  When credentials are absent it returns mock data
 * shaped identically to the Jira response format so the rest of the app can
 * develop against the same interfaces.
 */

// ---------------------------------------------------------------------------
// Jira API response types (subset we care about)
// ---------------------------------------------------------------------------

export interface JiraSprint {
  id: number;
  name: string;
  state: "active" | "future" | "closed";
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

export interface JiraSprintListResponse {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraSprint[];
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: Record<string, string>;
}

export interface JiraIssueFields {
  summary: string;
  issuetype: { name: string; iconUrl?: string };
  status: { name: string };
  priority?: { name: string; iconUrl?: string };
  assignee: JiraUser | null;
  reporter?: JiraUser | null;
  labels: string[];
  // Epic link or parent epic name depending on project config
  customfield_10008?: string | null;
  // Story points (classic projects)
  customfield_10028?: number | null;
  // Story points (next-gen / team-managed)
  story_points?: number | null;
  sprint?: JiraSprint | null;
  flagged?: boolean;
  description?: unknown;
  created: string;
  updated: string;
  // Acceptance criteria (custom field, varies per project)
  customfield_10034?: string | null;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraComment {
  id: string;
  author: JiraUser;
  body: unknown;
  created: string;
  updated: string;
}

export interface JiraCommentResponse {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  created: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Environment config
// ---------------------------------------------------------------------------

function getConfig() {
  return {
    baseUrl: process.env.JIRA_BASE_URL ?? "",
    email: process.env.JIRA_EMAIL ?? "",
    apiToken: process.env.JIRA_API_TOKEN ?? "",
    projectKey: process.env.JIRA_PROJECT_KEY ?? "VPL",
    boardId: process.env.JIRA_BOARD_ID ?? "",
  };
}

function isConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.baseUrl && cfg.email && cfg.apiToken);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function jiraFetch<T>(path: string): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Jira API ${res.status}: ${res.statusText} (${path})`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Mock data (mirrors Jira API shape)
// ---------------------------------------------------------------------------

const MOCK_SPRINTS: JiraSprint[] = [
  // BT (Bookingtool) - active + future
  { id: 10048, name: "BT: 134", state: "active", startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-09T00:00:00.000Z" },
  { id: 10050, name: "BT Sprint 135 candidates", state: "future" },
  { id: 10033, name: "BT: Next Sprint", state: "future" },
  { id: 10032, name: "BT: Backlog", state: "future" },
  { id: 10099, name: "BT - Cleanup", state: "future" },

  // BM (Booking Manager)
  { id: 10060, name: "BM: 134", state: "active", startDate: "2026-03-27T00:00:00.000Z", endDate: "2026-04-10T00:00:00.000Z" },
  { id: 10061, name: "BM: 135", state: "future", startDate: "2026-03-12T00:00:00.000Z", endDate: "2026-03-26T00:00:00.000Z" },
  { id: 10062, name: "BM: To be deprecated", state: "future" },
  { id: 10063, name: "BM: Backlog", state: "future" },

  // GXP (Guest Experience)
  { id: 10070, name: "GXP: 134", state: "active", startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-10T00:00:00.000Z" },
  { id: 10071, name: "GXP: 135", state: "future" },
  { id: 10072, name: "GXP: Backlog", state: "future" },

  // BO (Back Office)
  { id: 10080, name: "BO: 134", state: "active", startDate: "2026-03-31T00:00:00.000Z", endDate: "2026-04-14T00:00:00.000Z" },
  { id: 10081, name: "BO: 135", state: "future" },
  { id: 10082, name: "BO: Backlog", state: "future" },

  // Design
  { id: 10090, name: "Design: Backlog", state: "future" },

  // Signage
  { id: 10091, name: "Signage: Backlog", state: "future" },

  // Global backlog
  { id: 10001, name: "Backlog", state: "future" },

  // BT closed sprints (recent -> old)
  { id: 10047, name: "BT: 133", state: "closed", startDate: "2026-03-24T00:00:00.000Z", endDate: "2026-03-31T00:00:00.000Z", completeDate: "2026-03-31T00:00:00.000Z" },
  { id: 10046, name: "BT: 132", state: "closed", startDate: "2026-03-17T00:00:00.000Z", endDate: "2026-03-24T00:00:00.000Z", completeDate: "2026-03-24T00:00:00.000Z" },
  { id: 10045, name: "BT: 131", state: "closed", startDate: "2026-03-10T00:00:00.000Z", endDate: "2026-03-17T00:00:00.000Z", completeDate: "2026-03-17T00:00:00.000Z" },
  { id: 10044, name: "BT: 130", state: "closed", startDate: "2026-03-03T00:00:00.000Z", endDate: "2026-03-10T00:00:00.000Z", completeDate: "2026-03-10T00:00:00.000Z" },
  { id: 10043, name: "BT: 129", state: "closed", startDate: "2026-02-24T00:00:00.000Z", endDate: "2026-03-03T00:00:00.000Z", completeDate: "2026-03-03T00:00:00.000Z" },
  { id: 10042, name: "BT: 128", state: "closed", startDate: "2026-02-17T00:00:00.000Z", endDate: "2026-02-24T00:00:00.000Z", completeDate: "2026-02-24T00:00:00.000Z" },
  { id: 10041, name: "BT: 127", state: "closed", startDate: "2026-02-10T00:00:00.000Z", endDate: "2026-02-17T00:00:00.000Z", completeDate: "2026-02-17T00:00:00.000Z" },
  { id: 10040, name: "BT: 126", state: "closed", startDate: "2026-02-03T00:00:00.000Z", endDate: "2026-02-10T00:00:00.000Z", completeDate: "2026-02-10T00:00:00.000Z" },

  // BM closed sprints
  { id: 10059, name: "BM: 133", state: "closed", startDate: "2026-03-12T00:00:00.000Z", endDate: "2026-03-26T00:00:00.000Z", completeDate: "2026-03-26T00:00:00.000Z" },
  { id: 10058, name: "BM: 132", state: "closed", startDate: "2026-02-26T00:00:00.000Z", endDate: "2026-03-12T00:00:00.000Z", completeDate: "2026-03-12T00:00:00.000Z" },
  { id: 10057, name: "BM: 131", state: "closed", startDate: "2026-02-12T00:00:00.000Z", endDate: "2026-02-26T00:00:00.000Z", completeDate: "2026-02-26T00:00:00.000Z" },

  // GXP closed sprints
  { id: 10069, name: "GXP: 133", state: "closed", startDate: "2026-03-17T00:00:00.000Z", endDate: "2026-03-31T00:00:00.000Z", completeDate: "2026-03-31T00:00:00.000Z" },
  { id: 10068, name: "GXP: 132", state: "closed", startDate: "2026-03-03T00:00:00.000Z", endDate: "2026-03-17T00:00:00.000Z", completeDate: "2026-03-17T00:00:00.000Z" },

  // BO closed sprints
  { id: 10079, name: "BO: 133", state: "closed", startDate: "2026-03-17T00:00:00.000Z", endDate: "2026-03-31T00:00:00.000Z", completeDate: "2026-03-31T00:00:00.000Z" },
  { id: 10078, name: "BO: 132", state: "closed", startDate: "2026-03-03T00:00:00.000Z", endDate: "2026-03-17T00:00:00.000Z", completeDate: "2026-03-17T00:00:00.000Z" },
];

function mockUser(name: string, initials: string): JiraUser {
  return {
    accountId: `mock-${initials.toLowerCase()}`,
    displayName: name,
  };
}

const MOCK_ISSUES: JiraIssue[] = [
  {
    id: "29223", key: "VPL-29223",
    fields: {
      summary: "Monitoring Kibana (PROD) & heartbeat channel",
      issuetype: { name: "Task" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "LOGGING & METRICS",
      customfield_10028: null,
      created: "2026-01-15T10:00:00.000Z", updated: "2026-03-28T14:00:00.000Z",
    },
  },
  {
    id: "44062", key: "VPL-44062",
    fields: {
      summary: "Confirmation page extra preview does not hide mealplan extras included in rate",
      issuetype: { name: "Bug" },
      status: { name: "In Progress" },
      assignee: mockUser("Jan de Vries", "JV"),
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: null,
      flagged: true,
      created: "2026-03-20T09:00:00.000Z", updated: "2026-03-30T16:00:00.000Z",
    },
  },
  {
    id: "43237", key: "VPL-43237",
    fields: {
      summary: "Validate that selected rate belongs to the chosen package/deal on reservation creation",
      issuetype: { name: "Sub-task" },
      status: { name: "In Progress" },
      assignee: mockUser("Vera Zwart", "VZ"),
      labels: [],
      customfield_10008: null,
      customfield_10028: 2,
      created: "2026-03-10T11:00:00.000Z", updated: "2026-03-29T10:00:00.000Z",
    },
  },
  {
    id: "43241", key: "VPL-43241",
    fields: {
      summary: "Calamiteiten / Rollback plan",
      issuetype: { name: "Story" },
      status: { name: "In Progress" },
      assignee: mockUser("Mark Rutte", "MR"),
      labels: [],
      customfield_10008: null,
      customfield_10028: null,
      created: "2026-03-10T08:00:00.000Z", updated: "2026-03-28T15:00:00.000Z",
    },
  },
  {
    id: "44060", key: "VPL-44060",
    fields: {
      summary: "Add caching to hotel-service accommodation-types endpoint (and terms-and-conditions while we're at it)",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "TECH: GENERAL IMP.",
      customfield_10028: 1,
      created: "2026-03-19T14:00:00.000Z", updated: "2026-03-27T09:00:00.000Z",
    },
  },
  {
    id: "37366", key: "VPL-37366",
    fields: {
      summary: "Implement age bucket pricing for extras in upsell app and in all receipts",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: null,
      created: "2025-11-05T10:00:00.000Z", updated: "2026-03-25T11:00:00.000Z",
    },
  },
  {
    id: "33796", key: "VPL-33796",
    fields: {
      summary: "Show \"vanaf\" prices when not all prices in dailyprices are equal",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: null,
      created: "2025-09-12T13:00:00.000Z", updated: "2026-03-20T08:00:00.000Z",
    },
  },
  {
    id: "41192", key: "VPL-41192",
    fields: {
      summary: "Only show PES when there is a price and availability for the date(s) where the extra is actually booked",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: null,
      created: "2026-02-10T10:00:00.000Z", updated: "2026-03-15T14:00:00.000Z",
    },
  },
  {
    id: "43566", key: "VPL-43566",
    fields: {
      summary: "Upsell: Enable reservations for extra's which have inventory items configured in Daylight PMS",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: null,
      created: "2026-03-14T09:00:00.000Z", updated: "2026-03-28T12:00:00.000Z",
    },
  },
  {
    id: "43734", key: "VPL-43734",
    fields: {
      summary: "Implement stripped down upsell confirmation emails for OTA reservations",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: 2,
      created: "2026-03-17T10:00:00.000Z", updated: "2026-03-26T16:00:00.000Z",
    },
  },
  {
    id: "39544", key: "VPL-39544",
    fields: {
      summary: "Serve bookingtool on hotel domain under /booking/ for seamless GA tracking",
      issuetype: { name: "Story" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: null,
      customfield_10028: 3,
      created: "2026-01-20T11:00:00.000Z", updated: "2026-03-22T09:00:00.000Z",
    },
  },
  {
    id: "44150", key: "VPL-44150",
    fields: {
      summary: "Target blank hotelsite links in no avail dialogs",
      issuetype: { name: "Task" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: null,
      customfield_10028: null,
      created: "2026-03-28T10:00:00.000Z", updated: "2026-03-29T08:00:00.000Z",
    },
  },
  {
    id: "43242", key: "VPL-43242",
    fields: {
      summary: "Configure UATs with more prod-like data",
      issuetype: { name: "Task" },
      status: { name: "To Do" },
      assignee: mockUser("Mark Rutte", "MR"),
      labels: [],
      customfield_10008: null,
      customfield_10028: null,
      created: "2026-03-10T08:30:00.000Z", updated: "2026-03-25T14:00:00.000Z",
    },
  },
  {
    id: "43521", key: "VPL-43521",
    fields: {
      summary: "Test handmatige extra's op reservering",
      issuetype: { name: "Task" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: null,
      created: "2026-03-13T09:00:00.000Z", updated: "2026-03-20T10:00:00.000Z",
    },
  },
  {
    id: "43372", key: "VPL-43372",
    fields: {
      summary: "Rollout Temporal Loyal flow",
      issuetype: { name: "Task" },
      status: { name: "To Do" },
      assignee: mockUser("Sophie Bakker", "SB"),
      labels: [],
      customfield_10008: null,
      customfield_10028: null,
      created: "2026-03-11T14:00:00.000Z", updated: "2026-03-27T11:00:00.000Z",
    },
  },
  {
    id: "43001", key: "VPL-43001",
    fields: {
      summary: "Document Extras / create manual",
      issuetype: { name: "Story" },
      status: { name: "Test" },
      assignee: mockUser("Lisa Timmermans", "LT"),
      labels: [],
      customfield_10008: "BT: UPSELL",
      customfield_10028: 2,
      flagged: true,
      created: "2026-03-05T10:00:00.000Z", updated: "2026-03-30T09:00:00.000Z",
    },
  },
  {
    id: "44145", key: "VPL-44145",
    fields: {
      summary: "Create followup story for GXP (based on VPL-38475)",
      issuetype: { name: "Task" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: null,
      customfield_10028: null,
      created: "2026-03-28T08:00:00.000Z", updated: "2026-03-28T08:00:00.000Z",
    },
  },
  {
    id: "43900", key: "VPL-43900",
    fields: {
      summary: "Fix double-booking edge case in concurrent reservation flow",
      issuetype: { name: "Bug" },
      status: { name: "To Do" },
      assignee: null,
      labels: [],
      customfield_10008: null,
      customfield_10028: null,
      created: "2026-03-24T15:00:00.000Z", updated: "2026-03-28T10:00:00.000Z",
    },
  },
];

// ---------------------------------------------------------------------------
// Client class
// ---------------------------------------------------------------------------

export class JiraClient {
  /**
   * Fetch all sprints for the configured board.
   */
  async getSprints(): Promise<JiraSprint[]> {
    if (!isConfigured()) {
      return MOCK_SPRINTS;
    }

    const cfg = getConfig();
    const result = await jiraFetch<JiraSprintListResponse>(
      `/rest/agile/1.0/board/${cfg.boardId}/sprint?maxResults=50`,
    );
    return result.values;
  }

  /**
   * Fetch all issues for a given sprint.
   */
  async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    if (!isConfigured()) {
      return MOCK_ISSUES;
    }

    const result = await jiraFetch<JiraSearchResponse>(
      `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=200&fields=summary,issuetype,status,priority,assignee,reporter,labels,customfield_10008,customfield_10028,sprint,flagged,description,created,updated,customfield_10034`,
    );
    return result.issues;
  }

  /**
   * Fetch a single issue by key.
   */
  async getIssue(key: string): Promise<JiraIssue> {
    if (!isConfigured()) {
      const found = MOCK_ISSUES.find((i) => i.key === key);
      if (!found) throw new Error(`Issue ${key} not found`);
      return found;
    }

    return jiraFetch<JiraIssue>(
      `/rest/api/3/issue/${key}?fields=summary,issuetype,status,priority,assignee,reporter,labels,customfield_10008,customfield_10028,sprint,flagged,description,created,updated,customfield_10034`,
    );
  }

  /**
   * Fetch comments for an issue.
   */
  async getComments(key: string): Promise<JiraComment[]> {
    if (!isConfigured()) {
      return [];
    }

    const result = await jiraFetch<JiraCommentResponse>(
      `/rest/api/3/issue/${key}/comment?maxResults=100`,
    );
    return result.comments;
  }

  /**
   * Fetch attachments for an issue.
   */
  async getAttachments(key: string): Promise<JiraAttachment[]> {
    if (!isConfigured()) {
      return [];
    }

    const issue = await jiraFetch<{ fields: { attachment: JiraAttachment[] } }>(
      `/rest/api/3/issue/${key}?fields=attachment`,
    );
    return issue.fields.attachment ?? [];
  }

  /**
   * Whether the client is talking to a real Jira instance.
   */
  get isLive(): boolean {
    return isConfigured();
  }
}

// Singleton for convenience
export const jiraClient = new JiraClient();
