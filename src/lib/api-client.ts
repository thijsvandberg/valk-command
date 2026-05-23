// Centralized internal API client for all /api/* calls.
// Replaces scattered fetch() patterns with typed, consistent error handling.

import type { Ticket, TicketDetail, Sprint, StoryVersion, StoredReview, RelatedSuggestionResponse } from "@/types/ticket";
import type { Conversation, ConversationType, Message } from "@/types/chat";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  body: { error: string; code?: string } | null;

  constructor(status: number, body: { error: string; code?: string } | null) {
    super(body?.error ?? `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

export interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function apiFetch<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method, body, signal, headers } = options;

  const init: RequestInit = { method, signal };
  const mergedHeaders: Record<string, string> = { ...headers };

  if (body !== undefined) {
    mergedHeaders["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  if (Object.keys(mergedHeaders).length > 0) {
    init.headers = mergedHeaders;
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    let parsed: { error: string; code?: string } | null = null;
    try {
      parsed = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, parsed);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// SWR-compatible fetcher (drop-in replacement for per-file fetchers)
export const swrFetcher = <T>(url: string): Promise<T> => apiFetch<T>(url);

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function enc(v: string): string {
  return encodeURIComponent(v);
}

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export const tickets = {
  // -- URLs (for SWR keys) --
  listUrl: (sprintId?: string | null) =>
    sprintId === "__all__"
      ? "/api/tickets"
      : sprintId
        ? `/api/tickets${qs({ sprintId })}`
        : null,
  detailUrl: (key: string | null) =>
    key ? `/api/tickets/${enc(key)}` : null,
  metadataUrl: (key: string) =>
    `/api/tickets/${enc(key)}/metadata`,
  commentsUrl: (key: string) =>
    `/api/tickets/${enc(key)}/comments`,
  attachmentsUrl: (key: string) =>
    `/api/tickets/${enc(key)}/attachments`,
  localEditsUrl: (key: string) =>
    `/api/tickets/${enc(key)}/local-edits`,
  versionsUrl: (key: string) =>
    `/api/tickets/${enc(key)}/versions`,
  reviewsUrl: (key: string) =>
    `/api/tickets/${enc(key)}/reviews`,
  devInfoUrl: (key: string) =>
    `/api/tickets/${enc(key)}/dev-info`,

  // -- Actions --
  list: (sprintId?: string, signal?: AbortSignal) =>
    apiFetch<Ticket[]>(`/api/tickets${qs({ sprintId })}`, { signal }),
  get: (key: string, signal?: AbortSignal) =>
    apiFetch<Ticket & TicketDetail>(`/api/tickets/${enc(key)}`, { signal }),
  update: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<Ticket>(`/api/tickets/${enc(key)}`, { method: "PUT", body: data, signal }),
  updateStoryPoints: (key: string, storyPoints: number | null, signal?: AbortSignal) =>
    apiFetch<{ storyPoints: number | null }>(`/api/tickets/${enc(key)}`, { method: "PATCH", body: { storyPoints }, signal }),
  updateEpic: (key: string, epicKey: string | null, signal?: AbortSignal) =>
    apiFetch<{ epic: string | null; epicKey: string | null }>(`/api/tickets/${enc(key)}`, { method: "PATCH", body: { epicKey }, signal }),
  toggleFlag: (key: string, flagged: boolean, flagReason?: string, signal?: AbortSignal) =>
    apiFetch<{ flagged: boolean }>(`/api/tickets/${enc(key)}`, { method: "PATCH", body: { flagged, ...(flagReason ? { flagReason } : {}) }, signal }),

  getMetadata: (key: string, signal?: AbortSignal) =>
    apiFetch<Record<string, unknown>>(`/api/tickets/${enc(key)}/metadata`, { signal }),
  updateMetadata: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<Record<string, unknown>>(`/api/tickets/${enc(key)}/metadata`, { method: "PUT", body: data, signal }),

  getComments: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown[]>(`/api/tickets/${enc(key)}/comments`, { signal }),
  addComment: (key: string, data: { content: string }, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/comments`, { method: "POST", body: data, signal }),
  deleteComment: (key: string, commentId: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/comments/${enc(commentId)}`, { method: "DELETE", signal }),

  getAttachments: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown[]>(`/api/tickets/${enc(key)}/attachments`, { signal }),

  getLocalEdits: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/local-edits`, { signal }),
  saveLocalEdit: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/local-edits`, { method: "PUT", body: data, signal }),

  getVersions: (key: string, signal?: AbortSignal) =>
    apiFetch<StoryVersion[]>(`/api/tickets/${enc(key)}/versions`, { signal }),
  createVersion: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<StoryVersion>(`/api/tickets/${enc(key)}/versions`, { method: "POST", body: data, signal }),
  deleteVersion: (key: string, versionId: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/versions/${enc(versionId)}`, { method: "DELETE", signal }),
  importVersion: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<StoryVersion>(`/api/tickets/${enc(key)}/versions/import`, { method: "POST", body: data, signal }),

  getReviews: (key: string, signal?: AbortSignal) =>
    apiFetch<StoredReview[]>(`/api/tickets/${enc(key)}/reviews`, { signal }),
  createReview: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<StoredReview>(`/api/tickets/${enc(key)}/reviews`, { method: "POST", body: data, signal }),
  generateReview: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<{ taskId: string }>(`/api/tickets/${enc(key)}/reviews/generate`, { method: "POST", body: data, signal }),
  patchReview: (key: string, reviewId: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<StoredReview>(`/api/tickets/${enc(key)}/reviews/${enc(reviewId)}`, { method: "PATCH", body: data, signal }),
  deleteReview: (key: string, reviewId: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/reviews/${enc(reviewId)}`, { method: "DELETE", signal }),

  pullFromJira: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/pull-from-jira`, { method: "POST", signal }),
  pushToJira: (key: string, data?: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/push-to-jira`, { method: "POST", body: data, signal }),

  getDevInfo: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/dev-info`, { signal }),

  // Confluence links
  confluenceLinksUrl: (key: string) =>
    `/api/tickets/${enc(key)}/confluence-links`,
  getConfluenceLinks: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown[]>(`/api/tickets/${enc(key)}/confluence-links`, { signal }),
  addConfluenceLink: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/confluence-links`, { method: "POST", body: data, signal }),
  removeConfluenceLink: (key: string, data: { linkId: string }, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/confluence-links`, { method: "DELETE", body: data, signal }),

  confluenceMentionsUrl: (key: string) =>
    `/api/tickets/${enc(key)}/confluence-mentions`,

  // Subtasks
  createSubtask: (key: string, data: { title: string }, signal?: AbortSignal) =>
    apiFetch<import("@/types/ticket").Subtask>(`/api/tickets/${enc(key)}/subtasks`, { method: "POST", body: data, signal }),
  rankSubtasks: (key: string, data: { orderedKeys: string[]; movedKey: string; rankBefore?: string; rankAfter?: string }, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/subtasks/rank`, { method: "POST", body: data, signal }),

  // Epic children
  createChildIssue: (key: string, data: { title: string; issueType?: string }, signal?: AbortSignal) =>
    apiFetch<import("@/types/ticket").Subtask>(`/api/tickets/${enc(key)}/children`, { method: "POST", body: data, signal }),

  // Issue links
  createLink: (key: string, data: { targetKey: string; relation: string }, signal?: AbortSignal) =>
    apiFetch<import("@/types/ticket").LinkedIssue>(`/api/tickets/${enc(key)}/links`, { method: "POST", body: data, signal }),
  deleteLink: (key: string, data: { jiraLinkId?: string; linkedKey: string }, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/links`, { method: "DELETE", body: data, signal }),

  // Related suggestions (AI-powered)
  getRelatedSuggestions: (key: string, signal?: AbortSignal) =>
    apiFetch<{ suggestions: RelatedSuggestionResponse[]; cachedAt: string | null }>(`/api/tickets/${enc(key)}/related-suggestions`, { signal }),
  findRelatedSuggestions: (key: string, signal?: AbortSignal) =>
    apiFetch<{ suggestions?: RelatedSuggestionResponse[]; taskId?: string; streamUrl?: string; cached: boolean }>(`/api/tickets/${enc(key)}/related-suggestions`, { method: "POST", signal }),
  applyRelatedSuggestions: (key: string, data: { output: string }, signal?: AbortSignal) =>
    apiFetch<{ suggestions: RelatedSuggestionResponse[] }>(`/api/tickets/${enc(key)}/related-suggestions`, { method: "PUT", body: data, signal }),
  clearRelatedSuggestions: (key: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/related-suggestions`, { method: "DELETE", signal }),

  // Ticket search (for autocomplete)
  searchForLink: (query: string, excludeKey?: string, signal?: AbortSignal) =>
    apiFetch<Array<{ key: string; title: string; type: string; status: string; source?: "local" | "jira" }>>(`/api/tickets/search${qs({ q: query, exclude: excludeKey, jira: "0" })}`, { signal }),
  searchForLinkWithJira: (query: string, excludeKey?: string, signal?: AbortSignal) =>
    apiFetch<Array<{ key: string; title: string; type: string; status: string; source?: "local" | "jira" }>>(`/api/tickets/search${qs({ q: query, exclude: excludeKey })}`, { signal }),
  recentLinks: (excludeKey?: string, signal?: AbortSignal) =>
    apiFetch<Array<{ key: string; title: string; type: string; status: string; source?: "recent" }>>(`/api/tickets/search${qs({ recent: "1", exclude: excludeKey })}`, { signal }),
};

// ---------------------------------------------------------------------------
// Story Writer
// ---------------------------------------------------------------------------

export const storyWriter = {
  // -- URLs --
  sessionUrl: (key: string) =>
    `/api/tickets/${enc(key)}/story-writer`,
  activeSessionsUrl: () =>
    "/api/story-writer/active-sessions",

  // -- Actions --
  getSession: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer`, { signal }),
  createSession: (key: string, data?: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer`, { method: "POST", body: data, signal }),
  patchSession: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer`, { method: "PATCH", body: data, signal }),
  deleteSession: (key: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/story-writer`, { method: "DELETE", signal }),

  sendMessage: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/messages`, { method: "POST", body: data, signal }),

  applyDraft: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/apply-draft`, { method: "POST", body: data, signal }),
  dismissDraft: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/apply-draft`, { method: "DELETE", body: data, signal }),

  getRelated: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/apply-related`, { signal }),
  applyRelated: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/apply-related`, { method: "POST", body: data, signal }),
  toggleRelated: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/apply-related`, { method: "PATCH", body: data, signal }),

  activateSplit: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/split`, { method: "POST", body: data, signal }),

  logsUrl: (key: string, taskId: string) =>
    `/api/tickets/${enc(key)}/story-writer/logs/${enc(taskId)}`,
  getLogs: (key: string, taskId: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/tickets/${enc(key)}/story-writer/logs/${enc(taskId)}`, { signal }),

  createViaGlobal: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/story-writer/create", { method: "POST", body: data, signal }),
  createDraft: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/story-writer/create-draft", { method: "POST", body: data, signal }),
  draftStatus: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/story-writer/draft-status?key=${enc(key)}`, { signal }),
  finalizeDraft: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/story-writer/finalize-draft", { method: "POST", body: data, signal }),
  retryDraft: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/story-writer/retry-draft", { method: "POST", body: data, signal }),
};

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

export interface EpicSuggestion {
  key: string;
  name: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export const epics = {
  listUrl: () => "/api/epics" as const,

  list: (signal?: AbortSignal) =>
    apiFetch<{ key: string; name: string; status: string; childCount: number; summary: string | null; summaryStale: boolean }[]>("/api/epics", { signal }),

  updateSummary: (key: string, summary: string, signal?: AbortSignal) =>
    apiFetch<{ key: string; summary: string; summaryUpdatedAt: string }>(
      `/api/epics/${enc(key)}/summary`, { method: "PATCH", body: { summary }, signal },
    ),

  generateSummaries: (signal?: AbortSignal) =>
    apiFetch<{ taskId: string; streamUrl: string }>(
      "/api/epics/generate-summaries", { method: "POST", signal },
    ),

  suggestEpic: (ticketKey: string, signal?: AbortSignal) =>
    apiFetch<{ taskId: string; streamUrl: string }>(
      `/api/tickets/${enc(ticketKey)}/suggest-epic`, { method: "POST", signal },
    ),
};

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const conversations = {
  // -- URLs --
  listUrl: () => "/api/conversations" as const,
  detailUrl: (id: string) => `/api/conversations/${enc(id)}`,
  messagesUrl: (id: string) => `/api/conversations/${enc(id)}/messages`,

  // -- Actions --
  list: (signal?: AbortSignal) =>
    apiFetch<Conversation[]>("/api/conversations", { signal }),
  create: (data: { title?: string; type?: ConversationType }, signal?: AbortSignal) =>
    apiFetch<Conversation>("/api/conversations", { method: "POST", body: data, signal }),
  get: (id: string, signal?: AbortSignal) =>
    apiFetch<Conversation>(`/api/conversations/${enc(id)}`, { signal }),
  update: (id: string, data: Partial<Conversation>, signal?: AbortSignal) =>
    apiFetch<Conversation>(`/api/conversations/${enc(id)}`, { method: "PUT", body: data, signal }),
  delete: (id: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/conversations/${enc(id)}`, { method: "DELETE", signal }),

  getMessages: (id: string, signal?: AbortSignal) =>
    apiFetch<Message[]>(`/api/conversations/${enc(id)}/messages`, { signal }),
  sendMessage: (id: string, data: { role: string; content: string; workspaceTaskId?: string | null }, signal?: AbortSignal) =>
    apiFetch<Message>(`/api/conversations/${enc(id)}/messages`, { method: "POST", body: data, signal }),

  markRead: (id: string, signal?: AbortSignal) =>
    apiFetch<Conversation>(`/api/conversations/${enc(id)}`, {
      method: "PATCH",
      body: { readAt: new Date().toISOString() },
      signal,
    }),
  markUnread: (id: string, signal?: AbortSignal) =>
    apiFetch<Conversation>(`/api/conversations/${enc(id)}`, {
      method: "PATCH",
      body: { readAt: null },
      signal,
    }),
  bulk: (data: { ids: string[]; action: "delete" | "markRead" | "markUnread" }, signal?: AbortSignal) =>
    apiFetch<{ updated: number }>("/api/conversations/bulk", {
      method: "PATCH",
      body: data,
      signal,
    }),
};

// ---------------------------------------------------------------------------
// Workspace Tasks
// ---------------------------------------------------------------------------

export const workspaceTasks = {
  // -- URLs --
  listUrl: (conversationId?: string) =>
    `/api/workspace-tasks${qs({ conversationId })}`,
  detailUrl: (id: string) =>
    `/api/workspace-tasks/${enc(id)}`,
  streamUrl: (id: string) =>
    `/api/workspace-tasks/${enc(id)}/stream`,
  healthUrl: () => "/api/workspace-tasks/health" as const,
  skillsUrl: () => "/api/workspace-tasks/skills" as const,

  // -- Actions --
  list: (conversationId?: string, signal?: AbortSignal) =>
    apiFetch<unknown[]>(`/api/workspace-tasks${qs({ conversationId })}`, { signal }),
  create: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<{ id: string }>("/api/workspace-tasks", { method: "POST", body: data, signal }),
  get: (id: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/workspace-tasks/${enc(id)}`, { signal }),
  patch: (id: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/workspace-tasks/${enc(id)}`, { method: "PATCH", body: data, signal }),
  delete: (id: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/workspace-tasks/${enc(id)}`, { method: "DELETE", signal }),
  health: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/workspace-tasks/health", { signal }),
  skills: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/workspace-tasks/skills", { signal }),
};

// ---------------------------------------------------------------------------
// Jira Sync
// ---------------------------------------------------------------------------

export const jira = {
  // -- URLs --
  sprintsUrl: () => "/api/jira/sprints" as const,
  healthUrl: () => "/api/jira/health" as const,

  // -- Actions --
  getSprints: (signal?: AbortSignal) =>
    apiFetch<Sprint[]>("/api/jira/sprints", { signal }),
  syncSprints: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/sync-sprints", { method: "POST", signal }),
  syncTickets: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/sync-tickets", { method: "POST", body: data, signal }),
  syncComments: (data: { ticketKey: string }, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/sync-comments", { method: "POST", body: data, signal }),
  syncIncremental: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/sync-incremental", { method: "POST", signal }),
  checkUpdated: (key: string, signal?: AbortSignal) =>
    apiFetch<{ stale: boolean; removed?: boolean }>(`/api/jira/check-updated${qs({ key })}`, { signal }),
  health: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/health", { signal }),
  rank: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/rank", { method: "POST", body: data, signal }),
  moveSprint: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/move-sprint", { method: "POST", body: data, signal }),
  assign: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jira/assign", { method: "POST", body: data, signal }),
  updateSprint: (sprintId: string, data: { goal?: string; startDate?: string; endDate?: string }, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>(`/api/jira/sprints/${encodeURIComponent(sprintId)}`, { method: "PUT", body: data, signal }),
  createSprint: (data: { name: string; startDate?: string; endDate?: string; goal?: string }, signal?: AbortSignal) =>
    apiFetch<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null; goal: string | null }>(
      "/api/jira/sprints", { method: "POST", body: data, signal },
    ),
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const search = {
  // -- URLs --
  localUrl: (q: string) =>
    `/api/search/local${qs({ q })}`,
  filterOptionsUrl: () =>
    "/api/search/local/filter-options" as const,

  // -- Actions --
  local: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/search/local", { method: "POST", body: data, signal }),
  jira: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/search/jira", { method: "POST", body: data, signal }),
  filterOptions: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/search/local/filter-options", { signal }),
};

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

export const activityLog = {
  // -- URLs --
  listUrl: (params?: { limit?: number; stats?: boolean }) =>
    `/api/activity-log${qs(params ?? {})}`,

  // -- Actions --
  list: (params?: { limit?: number; stats?: boolean }, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/activity-log${qs(params ?? {})}`, { signal }),
  create: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/activity-log", { method: "POST", body: data, signal }),
  acknowledge: (id: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/activity-log/${enc(id)}/acknowledge`, { method: "POST", signal }),
  cancel: (id: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/activity-log/${enc(id)}/cancel`, { method: "POST", signal }),
  acknowledgeAll: (signal?: AbortSignal) =>
    apiFetch<void>("/api/activity-log/acknowledge-all", { method: "POST", signal }),
  cancelAll: (signal?: AbortSignal) =>
    apiFetch<void>("/api/activity-log/cancel-all", { method: "POST", signal }),
};

// ---------------------------------------------------------------------------
// Jobs & Scheduler
// ---------------------------------------------------------------------------

export const jobs = {
  // -- URLs --
  listUrl: () => "/api/jobs" as const,
  detailUrl: (id: string) => `/api/jobs/${enc(id)}`,

  // -- Actions --
  list: (signal?: AbortSignal) =>
    apiFetch<unknown[]>("/api/jobs", { signal }),
  create: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/jobs", { method: "POST", body: data, signal }),
  get: (id: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/jobs/${enc(id)}`, { signal }),
  update: (id: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/jobs/${enc(id)}`, { method: "PUT", body: data, signal }),
  delete: (id: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/jobs/${enc(id)}`, { method: "DELETE", signal }),
};

export const scheduler = {
  tick: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/scheduler/tick", { method: "POST", signal }),
  status: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/scheduler/tick", { signal }),
  run: (name: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/scheduler/run/${enc(name)}`, { method: "POST", signal }),
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settings = {
  // -- URLs --
  columnWidthsUrl: () => "/api/settings/column-widths" as const,
  columnConfigUrl: () => "/api/settings/column-config" as const,
  quickPromptsUrl: () => "/api/settings/quick-prompts" as const,
  savedSearchesUrl: () => "/api/settings/saved-searches" as const,
  notificationPrefsUrl: () => "/api/settings/notification-preferences" as const,
  subscribedTeamsUrl: () => "/api/settings/subscribed-teams" as const,

  // -- Actions --
  getColumnWidths: (signal?: AbortSignal) =>
    apiFetch<{ widths: Record<string, number> }>("/api/settings/column-widths", { signal }),
  saveColumnWidths: (widths: Record<string, number>, signal?: AbortSignal) =>
    apiFetch<{ widths: Record<string, number> }>("/api/settings/column-widths", { method: "PUT", body: { widths }, signal }),

  getColumnConfig: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/settings/column-config", { signal }),
  saveColumnConfig: (config: unknown, signal?: AbortSignal) =>
    apiFetch<void>("/api/settings/column-config", { method: "PUT", body: config, signal }),

  getQuickPrompts: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/settings/quick-prompts", { signal }),
  saveQuickPrompts: (data: unknown, signal?: AbortSignal) =>
    apiFetch<void>("/api/settings/quick-prompts", { method: "PUT", body: data, signal }),

  getSavedSearches: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/settings/saved-searches", { signal }),
  saveSavedSearches: (data: unknown, signal?: AbortSignal) =>
    apiFetch<void>("/api/settings/saved-searches", { method: "PUT", body: data, signal }),

  getNotificationPrefs: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/settings/notification-preferences", { signal }),
  saveNotificationPrefs: (data: unknown, signal?: AbortSignal) =>
    apiFetch<void>("/api/settings/notification-preferences", { method: "PUT", body: data, signal }),

  getSubscribedTeams: (signal?: AbortSignal) =>
    apiFetch<{ teams: string[]; available: string[] }>("/api/settings/subscribed-teams", { signal }),
  saveSubscribedTeams: (teams: string[], signal?: AbortSignal) =>
    apiFetch<{ teams: string[]; available: string[] }>("/api/settings/subscribed-teams", { method: "PUT", body: { teams }, signal }),
};

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

export const pipelines = {
  // -- URLs --
  listUrl: (params?: { repo?: string; ticketKey?: string; sprintTickets?: string; unlinked?: string; limit?: number }) =>
    `/api/pipelines${qs(params ?? {})}`,
  healthUrl: () => "/api/pipelines/health" as const,
  lastDeployedUrl: () => "/api/pipelines/last-deployed" as const,
  deploySettingsUrl: () => "/api/pipelines/deploy-settings" as const,

  // -- Actions --
  list: (params?: Record<string, string | number>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/pipelines${qs(params ?? {})}`, { signal }),
  refresh: (signal?: AbortSignal) =>
    apiFetch<void>("/api/pipelines", { method: "POST", signal }),
  tick: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/pipelines/tick", { method: "POST", signal }),
  health: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/pipelines/health", { signal }),
  lastDeployed: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/pipelines/last-deployed", { signal }),

  getDeploySettings: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/pipelines/deploy-settings", { signal }),
  updateDeploySettings: (data: unknown, signal?: AbortSignal) =>
    apiFetch<void>("/api/pipelines/deploy-settings", { method: "PUT", body: data, signal }),
};

// ---------------------------------------------------------------------------
// Followed Tickets & Sprints
// ---------------------------------------------------------------------------

export const followedTickets = {
  listUrl: () => "/api/followed-tickets" as const,

  list: (signal?: AbortSignal) =>
    apiFetch<string[]>("/api/followed-tickets", { signal }),
  follow: (ticketKey: string, signal?: AbortSignal) =>
    apiFetch<void>("/api/followed-tickets", { method: "POST", body: { ticketKey }, signal }),
  unfollow: (ticketKey: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/followed-tickets${qs({ ticketKey })}`, { method: "DELETE", signal }),
};

export const followedSprints = {
  listUrl: () => "/api/followed-sprints" as const,

  list: (signal?: AbortSignal) =>
    apiFetch<string[]>("/api/followed-sprints", { signal }),
  follow: (sprintName: string, signal?: AbortSignal) =>
    apiFetch<void>("/api/followed-sprints", { method: "POST", body: { sprintName }, signal }),
  unfollow: (sprintName: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/followed-sprints${qs({ sprintName })}`, { method: "DELETE", signal }),
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notifications = {
  listUrl: (limit?: number) =>
    `/api/notifications${qs({ limit })}`,

  list: (limit?: number, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/notifications${qs({ limit })}`, { signal }),
  markRead: (id: string, signal?: AbortSignal) =>
    apiFetch<void>("/api/notifications", { method: "PATCH", body: { id }, signal }),
  markAllRead: (signal?: AbortSignal) =>
    apiFetch<void>("/api/notifications", { method: "PATCH", body: { markAll: true }, signal }),
  markFilteredRead: (ids: string[], signal?: AbortSignal) =>
    apiFetch<void>("/api/notifications", { method: "PATCH", body: { ids }, signal }),
  clearRead: (signal?: AbortSignal) =>
    apiFetch<void>("/api/notifications", { method: "DELETE", signal }),
  dismiss: (id: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/notifications${qs({ id })}`, { method: "DELETE", signal }),
  clearFiltered: (ids: string[], signal?: AbortSignal) =>
    apiFetch<void>(`/api/notifications?ids=${ids.map(enc).join(",")}`, { method: "DELETE", signal }),
};

// ---------------------------------------------------------------------------
// Confluence
// ---------------------------------------------------------------------------

export const confluence = {
  healthUrl: () => "/api/confluence/health" as const,
  searchUrl: (q: string) => `/api/confluence/search${qs({ q })}`,
  pageUrl: (pageId: string) => `/api/confluence/pages/${enc(pageId)}`,

  health: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/confluence/health", { signal }),
  search: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/confluence/search", { method: "POST", body: data, signal }),
  getPage: (pageId: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/confluence/pages/${enc(pageId)}`, { signal }),
};

// ---------------------------------------------------------------------------
// Sprint Slots
// ---------------------------------------------------------------------------

export const sprintSlots = {
  listUrl: () => "/api/sprint-slots" as const,

  list: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/sprint-slots", { signal }),
  save: (data: unknown, signal?: AbortSignal) =>
    apiFetch<void>("/api/sprint-slots", { method: "POST", body: data, signal }),
};

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------

export const velocity = {
  url: () => "/api/velocity" as const,

  get: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/velocity", { signal }),
};

// ---------------------------------------------------------------------------
// Stakeholder
// ---------------------------------------------------------------------------

export const stakeholder = {
  analysisUrl: (params?: Record<string, string>) =>
    `/api/stakeholder/analysis${qs(params ?? {})}`,
  analysisDetailUrl: (id: string) =>
    `/api/stakeholder/analysis/${enc(id)}`,

  listAnalyses: (params?: Record<string, string>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/stakeholder/analysis${qs(params ?? {})}`, { signal }),
  getAnalysis: (id: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/stakeholder/analysis/${enc(id)}`, { signal }),
  createAnalysis: (data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>("/api/stakeholder/analysis", { method: "POST", body: data, signal }),
};

// ---------------------------------------------------------------------------
// Config / Cache / Debug
// ---------------------------------------------------------------------------

export const config = {
  url: () => "/api/config" as const,
  get: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/config", { signal }),
};

export const burnup = {
  url: (sprintId: string) => `/api/burnup?sprintId=${enc(sprintId)}` as const,
  get: (sprintId: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/burnup?sprintId=${enc(sprintId)}`, { signal }),
  seed: (sprintId: string, signal?: AbortSignal) =>
    apiFetch<{ seeded: boolean; changeCount: number }>(`/api/burnup/seed?sprintId=${enc(sprintId)}`, { method: "POST", signal }),
};

export const cache = {
  flush: (signal?: AbortSignal) =>
    apiFetch<void>("/api/cache/flush", { method: "POST", signal }),
  stats: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/cache/stats", { signal }),
};
