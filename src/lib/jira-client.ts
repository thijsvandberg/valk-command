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
const STORY_POINTS_FIELD = "customfield_11909";
const ACCEPTANCE_CRITERIA_FIELD = "customfield_10034";

// Fields to request when fetching full issue data
const ISSUE_FIELDS = [
  "summary", "issuetype", "status", "priority", "assignee", "reporter",
  "labels", "parent", STORY_POINTS_FIELD, SPRINT_FIELD, "flagged",
  "description", "created", "updated", ACCEPTANCE_CRITERIA_FIELD, "components",
  "attachment", "subtasks", "issuelinks", "comment",
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
  // Modern Jira hierarchy: stories/tasks are children of epics via parent
  parent?: { id: string; key: string; fields: { summary: string; issuetype?: { name: string } } } | null;
  flagged?: boolean;
  description?: unknown;
  created: string;
  updated: string;
  components?: Array<{ name: string }>;
  attachment?: JiraAttachment[];
  subtasks?: JiraSubtask[];
  issuelinks?: JiraIssueLink[];
  comment?: { total: number; comments: JiraComment[] };
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

interface JiraLinkedIssueRef {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    assignee?: JiraUser | null;
    priority?: { name: string };
  };
}

export interface JiraSubtask {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    assignee?: JiraUser | null;
    priority?: { name: string };
  };
}

export interface JiraIssueLink {
  id: string;
  type: { name: string; inward: string; outward: string };
  inwardIssue?: JiraLinkedIssueRef;
  outwardIssue?: JiraLinkedIssueRef;
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
// Rate limiting: sliding window throttle (max 200 req/min with buffer)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 200;
const MIN_REQUEST_GAP_MS = 100;

const requestTimestamps: number[] = [];

async function throttle(): Promise<void> {
  const now = Date.now();
  // Prune timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }

  // Enforce minimum gap between requests
  if (requestTimestamps.length > 0) {
    const lastRequest = requestTimestamps[requestTimestamps.length - 1];
    const gap = now - lastRequest;
    if (gap < MIN_REQUEST_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - gap));
    }
  }

  // Enforce sliding window limit
  if (requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = requestTimestamps[0];
    const waitMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - Date.now() + 1;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  requestTimestamps.push(Date.now());
}

// Exported for testing
export { requestTimestamps as _requestTimestamps };

// ---------------------------------------------------------------------------
// Retry logic: exponential backoff for transient errors
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export class JiraApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly responseBody: string,
    public readonly path: string,
  ) {
    super(`Jira API ${status} ${statusText} on ${path}: ${responseBody}`);
    this.name = "JiraApiError";
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 503;
}

async function withRetry<T>(
  fn: () => Promise<Response>,
  parse: (res: Response) => Promise<T>,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }

    try {
      await throttle();
      const res = await fn();

      if (res.ok) {
        return parse(res);
      }

      if (isRetryable(res.status) && attempt < MAX_RETRIES) {
        const retryAfterHeader = res.headers.get("Retry-After");
        let delayMs: number;
        if (retryAfterHeader) {
          const seconds = parseInt(retryAfterHeader, 10);
          delayMs = isNaN(seconds) ? INITIAL_BACKOFF_MS * 2 ** attempt : seconds * 1000;
        } else {
          delayMs = INITIAL_BACKOFF_MS * 2 ** attempt;
        }
        console.warn(`Jira API ${res.status} on ${path}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      const body = await res.text().catch(() => "");
      console.error(`Jira API error: ${res.status} ${res.statusText} path=${path} body=${body}`);
      throw new JiraApiError(res.status, res.statusText, body, path);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (err instanceof JiraApiError) throw err;

      // Network errors / timeouts are retryable
      if (attempt < MAX_RETRIES) {
        const delayMs = INITIAL_BACKOFF_MS * 2 ** attempt;
        console.warn(`Jira API network error on ${path}: ${err instanceof Error ? err.message : err}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Jira API request failed after retries");
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function jiraFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");

  return withRetry(
    () => fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      signal,
    }),
    (res) => res.json() as Promise<T>,
    path,
    signal,
  );
}

async function jiraPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");

  return withRetry(
    () => fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    }),
    (res) => res.json() as Promise<T>,
    path,
    signal,
  );
}

async function jiraPut(path: string, body: unknown, signal?: AbortSignal): Promise<void> {
  const cfg = getConfig();
  const url = `${cfg.baseUrl}${path}`;
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");

  return withRetry(
    () => fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    }),
    async () => {},
    path,
    signal,
  );
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

/**
 * Extract epic name from the parent field (modern Jira uses hierarchy: story → epic via parent).
 * Returns the parent's summary when the parent is an Epic, null otherwise.
 */
export function extractEpicLink(fields: JiraIssueFields): { name: string; key: string } | null {
  const parent = fields.parent;
  if (!parent?.fields?.summary || !parent.key) return null;
  const parentType = parent.fields.issuetype?.name?.toLowerCase() ?? "";
  if (parentType && parentType !== "epic") return null;
  return { name: parent.fields.summary, key: parent.key };
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
   * Fetch the most recent changelog author for an issue.
   * Used to determine who made the latest content change.
   */
  async getLastChangeAuthor(key: string, signal?: AbortSignal): Promise<{ name: string; avatar: string | null } | null> {
    if (!isConfigured()) return null;

    try {
      const result = await jiraFetch<{
        values: Array<{
          author: { displayName: string; avatarUrls?: Record<string, string> };
        }>;
      }>(
        `/rest/api/3/issue/${key}/changelog?maxResults=1`,
        signal,
      );
      const entry = result.values?.[result.values.length - 1];
      if (!entry?.author) return null;
      return {
        name: entry.author.displayName,
        avatar: entry.author.avatarUrls?.["48x48"] ?? null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Update an issue's fields in Jira (summary, description).
   * Uses REST API v3 PUT /rest/api/3/issue/{key}.
   */
  async updateIssue(key: string, fields: { summary?: string; description?: unknown }, signal?: AbortSignal): Promise<void> {
    if (!isConfigured()) {
      throw new Error("Jira is not configured");
    }

    await jiraPut(`/rest/api/3/issue/${key}`, { fields }, signal);
  }

  /**
   * Create a new issue in Jira. Returns the new issue key and id.
   */
  async createIssue(params: {
    summary: string;
    description?: unknown;
    issueType?: string;
    projectKey?: string;
    sprintId?: string;
  }, signal?: AbortSignal): Promise<{ key: string; id: string }> {
    if (!isConfigured()) {
      throw new Error("Jira is not configured");
    }

    const body = {
      fields: {
        project: { key: params.projectKey ?? "VPL" },
        summary: params.summary,
        issuetype: { name: params.issueType ?? "Story" },
        ...(params.description ? { description: params.description } : {}),
        // Sprint field requires a plain integer for Jira Cloud (not wrapped in {id})
        ...(params.sprintId ? { [SPRINT_FIELD]: parseInt(params.sprintId, 10) } : {}),
      },
    };

    const result = await jiraPost<{ id: string; key: string }>(
      "/rest/api/3/issue",
      body,
      signal,
    );

    return { key: result.key, id: result.id };
  }

  /**
   * Search Jira issues via JQL. Used by the sprint board search modal.
   * Returns up to maxResults issues (default 25).
   */
  async searchIssues(jql: string, fields?: string[], maxResults = 25, signal?: AbortSignal): Promise<JiraIssue[]> {
    if (!isConfigured()) {
      return [];
    }

    const fieldList = fields ? fields.join(",") : `summary,status,assignee,priority,issuetype,${SPRINT_FIELD}`;
    const result = await jiraFetch<JiraSearchResponse>(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fieldList}&maxResults=${maxResults}`,
      signal,
    );
    return result.issues;
  }

  /**
   * Whether the client is talking to a real Jira instance.
   */
  get isLive(): boolean {
    return isConfigured();
  }
}

// Re-export field constants for use in sync routes
export { SPRINT_FIELD, STORY_POINTS_FIELD, ACCEPTANCE_CRITERIA_FIELD };

// Singleton for convenience
export const jiraClient = new JiraClient();
