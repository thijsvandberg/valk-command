/**
 * Jira REST API client.
 *
 * Authenticates via Atlassian's API gateway (api.atlassian.com) using
 * JIRA_CLOUD_ID, or falls back to direct instance access via JIRA_BASE_URL.
 * Uses REST API v3 exclusively (no Agile API) to stay within OAuth scopes.
 * When credentials are absent the client returns empty arrays so the rest
 * of the app can run without a Jira connection.
 */

// ---------------------------------------------------------------------------
// Custom field IDs for new-story.atlassian.net (must match jira-mcp config)
// ---------------------------------------------------------------------------

const SPRINT_FIELD = "customfield_10007";
const STORY_POINTS_FIELD = "customfield_10016";
const EPIC_LINK_FIELD = "customfield_10008";
const ACCEPTANCE_CRITERIA_FIELD = "customfield_10034";

// Fields to request when fetching full issue data
const ISSUE_FIELDS = [
  "summary", "issuetype", "status", "priority", "assignee", "reporter",
  "labels", EPIC_LINK_FIELD, STORY_POINTS_FIELD, SPRINT_FIELD, "flagged",
  "description", "created", "updated", ACCEPTANCE_CRITERIA_FIELD, "components",
].join(",");

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
  boardId?: number;
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
  // Sprint field (REST API v3 returns array of sprint objects)
  [key: `customfield_${string}`]: unknown;
  flagged?: boolean;
  description?: unknown;
  created: string;
  updated: string;
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
  isLast?: boolean;
  nextPageToken?: string;
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
  const cloudId = process.env.JIRA_CLOUD_ID ?? "";
  const directUrl = process.env.JIRA_BASE_URL ?? "";
  // Prefer API gateway (matches jira-mcp auth pattern), fall back to direct URL
  const baseUrl = cloudId
    ? `https://api.atlassian.com/ex/jira/${cloudId}`
    : directUrl;

  return {
    baseUrl,
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
// HTTP helpers
// ---------------------------------------------------------------------------

async function jiraFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jira API ${res.status}: ${res.statusText} (${path}) ${body}`);
  }

  return res.json() as Promise<T>;
}

async function jiraPost<T>(path: string, body: unknown): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jira API ${res.status}: ${res.statusText} (${path}) ${text}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** Extract sprint data from the REST API v3 sprint custom field (array of sprint objects) */
export function extractSprint(fields: JiraIssueFields): JiraSprint | null {
  const sprintList = fields[SPRINT_FIELD as `customfield_${string}`] as JiraSprint[] | null | undefined;
  if (!Array.isArray(sprintList) || sprintList.length === 0) return null;
  return sprintList[sprintList.length - 1];
}

/** Extract story points from the custom field */
export function extractStoryPoints(fields: JiraIssueFields): number | null {
  const val = fields[STORY_POINTS_FIELD as `customfield_${string}`];
  return typeof val === "number" ? val : null;
}

/** Extract epic link from the custom field */
export function extractEpicLink(fields: JiraIssueFields): string | null {
  const val = fields[EPIC_LINK_FIELD as `customfield_${string}`];
  return typeof val === "string" ? val : null;
}

/** Extract acceptance criteria from the custom field */
export function extractAcceptanceCriteria(fields: JiraIssueFields): string | null {
  const val = fields[ACCEPTANCE_CRITERIA_FIELD as `customfield_${string}`];
  return typeof val === "string" ? val : null;
}

// ---------------------------------------------------------------------------
// Client class
// ---------------------------------------------------------------------------

export class JiraClient {
  /**
   * Fetch sprints by searching for issues in active/future sprints,
   * then extracting sprint data from the sprint custom field.
   * Uses REST API v3 search (no Agile API needed).
   */
  async getSprints(states: string[] = ["active", "future"], signal?: AbortSignal, maxSprints?: number): Promise<JiraSprint[]> {
    if (!isConfigured()) {
      return [];
    }

    const cfg = getConfig();
    const jqlParts: string[] = [];
    for (const s of states) {
      if (s === "active") jqlParts.push("sprint in openSprints()");
      else if (s === "future") jqlParts.push("sprint in futureSprints()");
      else if (s === "closed") jqlParts.push("sprint in closedSprints()");
    }
    if (jqlParts.length === 0) return [];

    const jql = `project = ${cfg.projectKey} AND (${jqlParts.join(" OR ")}) ORDER BY updated DESC`;
    const boardId = cfg.boardId ? parseInt(cfg.boardId, 10) : null;
    const seen = new Set<number>();
    const sprints: JiraSprint[] = [];

    let pageToken: string | undefined;
    while (true) {
      const tokenParam = pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : "";
      const result = await jiraFetch<JiraSearchResponse>(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${SPRINT_FIELD}&maxResults=100${tokenParam}`,
        signal,
      );

      for (const issue of result.issues) {
        const sprintList = issue.fields[SPRINT_FIELD as `customfield_${string}`] as JiraSprint[] | null;
        if (!Array.isArray(sprintList)) continue;
        for (const sp of sprintList) {
          if (seen.has(sp.id)) continue;
          seen.add(sp.id);
          if (boardId && sp.boardId !== boardId) continue;
          const state = sp.state?.toLowerCase();
          if (!states.includes(state)) continue;
          sprints.push(sp);
        }
      }

      if (maxSprints && sprints.length >= maxSprints) break;
      if (result.isLast !== false || !result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }

    return sprints;
  }

  /**
   * Fetch all issues for a given sprint using JQL search.
   */
  async getSprintIssues(sprintId: number, signal?: AbortSignal): Promise<JiraIssue[]> {
    if (!isConfigured()) {
      return [];
    }

    const jql = `sprint = ${sprintId} ORDER BY rank ASC`;
    let all: JiraIssue[] = [];
    let pageToken: string | undefined;

    while (true) {
      const tokenParam = pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : "";
      const result = await jiraFetch<JiraSearchResponse>(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${ISSUE_FIELDS}&maxResults=100${tokenParam}`,
        signal,
      );
      all = all.concat(result.issues);
      if (result.isLast !== false || !result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }

    return all;
  }

  /**
   * Fetch a single issue by key.
   */
  async getIssue(key: string, signal?: AbortSignal): Promise<JiraIssue> {
    if (!isConfigured()) {
      throw new Error("Jira is not configured");
    }

    return jiraFetch<JiraIssue>(
      `/rest/api/3/issue/${key}?fields=${ISSUE_FIELDS}`,
      signal,
    );
  }

  /**
   * Fetch comments for an issue.
   */
  async getComments(key: string, signal?: AbortSignal): Promise<JiraComment[]> {
    if (!isConfigured()) {
      return [];
    }

    const result = await jiraFetch<JiraCommentResponse>(
      `/rest/api/3/issue/${key}/comment?maxResults=100`,
      signal,
    );
    return result.comments;
  }

  /**
   * Fetch attachments for an issue.
   */
  async getAttachments(key: string, signal?: AbortSignal): Promise<JiraAttachment[]> {
    if (!isConfigured()) {
      return [];
    }

    const issue = await jiraFetch<{ fields: { attachment: JiraAttachment[] } }>(
      `/rest/api/3/issue/${key}?fields=attachment`,
      signal,
    );
    return issue.fields.attachment ?? [];
  }

  /**
   * Verify Jira connectivity with a lightweight search.
   * Uses search/jql instead of /myself (which requires read:me scope).
   */
  async checkHealth(): Promise<{ displayName: string; emailAddress: string }> {
    const cfg = getConfig();
    const result = await jiraFetch<JiraSearchResponse>(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(`project = ${cfg.projectKey}`)}&maxResults=1&fields=summary`,
    );
    // If we get here without error, the connection works
    return {
      displayName: cfg.email,
      emailAddress: cfg.email,
    };
  }

  /**
   * Fetch only key + updated timestamp for all sprint issues.
   * Used by the timestamp-first sync strategy to detect which issues changed.
   */
  async getSprintIssueTimestamps(sprintId: number, signal?: AbortSignal): Promise<Array<{ key: string; updated: string }>> {
    if (!isConfigured()) {
      return [];
    }

    const jql = `sprint = ${sprintId}`;
    let all: Array<{ key: string; updated: string }> = [];
    let pageToken: string | undefined;

    while (true) {
      const tokenParam = pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : "";
      const result = await jiraFetch<JiraSearchResponse>(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=updated&maxResults=200${tokenParam}`,
        signal,
      );
      all = all.concat(result.issues.map((i) => ({ key: i.key, updated: i.fields.updated })));
      if (result.isLast !== false || !result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }

    return all;
  }

  /**
   * Fetch full issue data for a specific set of keys (used by timestamp-first strategy).
   */
  async getIssuesByKeys(keys: string[], signal?: AbortSignal): Promise<JiraIssue[]> {
    if (!isConfigured()) {
      return [];
    }

    const jql = `key in (${keys.join(",")})`;
    let all: JiraIssue[] = [];
    let pageToken: string | undefined;

    while (true) {
      const tokenParam = pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : "";
      const result = await jiraFetch<JiraSearchResponse>(
        `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${ISSUE_FIELDS}&maxResults=100${tokenParam}`,
        signal,
      );
      all = all.concat(result.issues);
      if (result.isLast !== false || !result.nextPageToken) break;
      pageToken = result.nextPageToken;
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

// Re-export field constants for use in sync routes
export { SPRINT_FIELD, STORY_POINTS_FIELD, EPIC_LINK_FIELD, ACCEPTANCE_CRITERIA_FIELD };

// Singleton for convenience
export const jiraClient = new JiraClient();
