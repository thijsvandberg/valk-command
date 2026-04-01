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
  components?: Array<{ name: string }>;
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
// Client class
// ---------------------------------------------------------------------------

export class JiraClient {
  /**
   * Fetch all sprints for the configured board.
   */
  async getSprints(): Promise<JiraSprint[]> {
    if (!isConfigured()) {
      return [];
    }

    const cfg = getConfig();
    let all: JiraSprint[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const result = await jiraFetch<JiraSprintListResponse>(
        `/rest/agile/1.0/board/${cfg.boardId}/sprint?maxResults=${maxResults}&startAt=${startAt}`,
      );
      all = all.concat(result.values);
      if (result.isLast) break;
      startAt += maxResults;
    }

    return all;
  }

  /**
   * Fetch all issues for a given sprint.
   */
  async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    if (!isConfigured()) {
      return [];
    }

    const fields = "summary,issuetype,status,priority,assignee,reporter,labels,customfield_10008,customfield_10028,sprint,flagged,description,created,updated,customfield_10034,components";
    let all: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const result = await jiraFetch<JiraSearchResponse>(
        `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=${maxResults}&startAt=${startAt}&fields=${fields}`,
      );
      all = all.concat(result.issues);
      if (startAt + result.issues.length >= result.total) break;
      startAt += maxResults;
    }

    return all;
  }

  /**
   * Fetch a single issue by key.
   */
  async getIssue(key: string): Promise<JiraIssue> {
    if (!isConfigured()) {
      throw new Error("Jira is not configured");
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
   * Verify Jira connectivity by calling /rest/api/3/myself.
   */
  async checkHealth(): Promise<{ displayName: string; emailAddress: string }> {
    return jiraFetch<{ displayName: string; emailAddress: string }>("/rest/api/3/myself");
  }

  /**
   * Fetch only key + updated timestamp for all sprint issues.
   * Used by the timestamp-first sync strategy to detect which issues changed.
   */
  async getSprintIssueTimestamps(sprintId: number): Promise<Array<{ key: string; updated: string }>> {
    if (!isConfigured()) {
      return [];
    }

    let all: Array<{ key: string; updated: string }> = [];
    let startAt = 0;
    const maxResults = 200;

    while (true) {
      const result = await jiraFetch<JiraSearchResponse>(
        `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=${maxResults}&startAt=${startAt}&fields=updated`,
      );
      all = all.concat(result.issues.map((i) => ({ key: i.key, updated: i.fields.updated })));
      if (startAt + result.issues.length >= result.total) break;
      startAt += maxResults;
    }

    return all;
  }

  /**
   * Fetch full issue data for a specific set of keys (used by timestamp-first strategy).
   */
  async getIssuesByKeys(keys: string[]): Promise<JiraIssue[]> {
    if (!isConfigured()) {
      return [];
    }

    const jql = `key in (${keys.join(",")})`;
    const fields = "summary,issuetype,status,priority,assignee,reporter,labels,customfield_10008,customfield_10028,sprint,flagged,description,created,updated,customfield_10034,components";

    let all: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const result = await jiraFetch<JiraSearchResponse>(
        `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=${fields}&maxResults=${maxResults}&startAt=${startAt}`,
      );
      all = all.concat(result.issues);
      if (startAt + result.issues.length >= result.total) break;
      startAt += maxResults;
    }

    return all;
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
