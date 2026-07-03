// Centralized internal API client for all /api/* calls.
// Replaces scattered fetch() patterns with typed, consistent error handling.

import type { Ticket, TicketDetail, Sprint, StoryVersion, StoredReview, RelatedSuggestionResponse, SubtaskSuggestionResponse, PlaceholderTicket } from "@/types/ticket";
import type { Conversation, ConversationType, Message } from "@/types/chat";
import { CLIENT_ID_HEADER, getClientId } from "@/lib/client-id";

export interface LinkSearchResult {
  key: string;
  title: string;
  type: string;
  status: string;
  sprintName: string | null;
  epicKey: string | null;
  assignee: string | null;
  jiraUpdatedAt: string | null;
  project: string | null;
  source: "local" | "jira" | "recent";
}

// Server-computed option lists for the Link issue filter bar (BRDG-396). Covers
// the whole candidate pool, so the dropdowns never collapse to the current filter.
export interface LinkSearchFacets {
  types: string[];
  statuses: string[];
  projects: string[];
  assignees: string[];
}

// Server-side filters for the Link issue modal. All optional; an empty object is
// a plain search. Multi-value facets are sent as comma-joined CSV.
export interface LinkSearchFilters {
  types?: string[];
  statuses?: string[];
  sprints?: string[];
  teams?: string[];
  epics?: string[];
  assignees?: string[];
  projects?: string[];
  updatedWithin?: string | null;
  preset?: "epic" | "sprint" | null;
}

export interface LinkSearchResponse {
  results: LinkSearchResult[];
  hasMore: boolean;
  facets?: LinkSearchFacets;
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  body: { error: string; code?: string; detail?: string } | null;

  constructor(status: number, body: { error: string; code?: string; detail?: string } | null) {
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

  // Tag every call with this tab's id so write routes can mark the resulting
  // ticket event with its origin (self-echo suppression for live updates).
  const clientId = getClientId();
  if (clientId) mergedHeaders[CLIENT_ID_HEADER] = clientId;

  if (body !== undefined) {
    mergedHeaders["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  if (Object.keys(mergedHeaders).length > 0) {
    init.headers = mergedHeaders;
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    let parsed: { error: string; code?: string; detail?: string } | null = null;
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

// Serializes Link issue filters into query params (BRDG-396). `qs()` drops
// empty/undefined values, so absent filters add nothing to the URL.
function linkFilterParams(f?: LinkSearchFilters): Record<string, string | undefined> {
  if (!f) return {};
  const join = (a?: string[]) => (a && a.length > 0 ? a.join(",") : undefined);
  return {
    types: join(f.types),
    status: join(f.statuses),
    sprint: join(f.sprints),
    team: join(f.teams),
    epic: join(f.epics),
    assignee: join(f.assignees),
    project: join(f.projects),
    updatedWithin: f.updatedWithin ?? undefined,
    preset: f.preset ?? undefined,
  };
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
  updateLabels: (key: string, labels: string[], signal?: AbortSignal) =>
    apiFetch<{ labels: string[] }>(`/api/tickets/${enc(key)}`, { method: "PATCH", body: { labels }, signal }),

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

  addJiraComment: (key: string, data: { content: string }, signal?: AbortSignal) =>
    apiFetch<{ id: string; authorName: string; authorAvatar: string | null; authorInitials: string; authorColor: string; content: string; createdAt: string }>(`/api/tickets/${enc(key)}/jira-comments`, { method: "POST", body: data, signal }),

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
  getSubtasks: (key: string, signal?: AbortSignal) =>
    apiFetch<{ key: string; title: string; status: string }[]>(`/api/tickets/${enc(key)}/subtasks`, { signal }),
  createSubtask: (key: string, data: { title: string }, signal?: AbortSignal) =>
    apiFetch<import("@/types/ticket").Subtask>(`/api/tickets/${enc(key)}/subtasks`, { method: "POST", body: data, signal }),
  rankSubtasks: (key: string, data: { orderedKeys: string[]; movedKey: string; rankBefore?: string; rankAfter?: string }, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/subtasks/rank`, { method: "POST", body: data, signal }),
  renameSubtask: (key: string, subtaskKey: string, data: { title: string }, signal?: AbortSignal) =>
    apiFetch<{ key: string; title: string }>(`/api/tickets/${enc(key)}/subtasks/${enc(subtaskKey)}`, { method: "PATCH", body: data, signal }),
  deleteSubtask: (key: string, subtaskKey: string, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>(`/api/tickets/${enc(key)}/subtasks/${enc(subtaskKey)}`, { method: "DELETE", signal }),
  closeSubtask: (key: string, subtaskKey: string, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>(`/api/tickets/${enc(key)}/subtasks/${enc(subtaskKey)}/close`, { method: "POST", signal }),

  // Epic children
  createChildIssue: (key: string, data: { title: string; issueType?: string; sprintId?: string }, signal?: AbortSignal) =>
    apiFetch<import("@/types/ticket").Subtask>(`/api/tickets/${enc(key)}/children`, { method: "POST", body: data, signal }),

  // Standalone create (sprint board): a story/task/bug not tied to an epic, optionally landed in a sprint.
  createTicket: (data: { title: string; issueType?: string; sprintId?: string; epicKey?: string }, signal?: AbortSignal) =>
    apiFetch<{ key: string; title: string; type: string; jiraStatus: string; sprintId: string | null; epic: string | null; epicKey: string | null; assignee: null }>("/api/tickets", { method: "POST", body: data, signal }),

  // Issue links
  createLink: (key: string, data: { targetKey: string; relation: string; jiraTypeName?: string; direction?: "inward" | "outward" }, signal?: AbortSignal) =>
    apiFetch<import("@/types/ticket").LinkedIssue>(`/api/tickets/${enc(key)}/links`, { method: "POST", body: data, signal }),
  deleteLink: (key: string, data: { jiraLinkId?: string; linkedKey: string; relation?: string }, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/links`, { method: "DELETE", body: data, signal }),
  // Change the relation TYPE of an existing link (delete old + create new, server-side).
  changeLinkType: (key: string, data: { jiraLinkId?: string; linkedKey: string; currentRelation: string; relation: string; jiraTypeName?: string; direction?: "inward" | "outward" }, signal?: AbortSignal) =>
    apiFetch<import("@/types/ticket").LinkedIssue>(`/api/tickets/${enc(key)}/links`, { method: "PATCH", body: data, signal }),

  // Related suggestions (AI-powered)
  getRelatedSuggestions: (key: string, signal?: AbortSignal) =>
    apiFetch<{ suggestions: RelatedSuggestionResponse[]; cachedAt: string | null }>(`/api/tickets/${enc(key)}/related-suggestions`, { signal }),
  findRelatedSuggestions: (key: string, signal?: AbortSignal) =>
    apiFetch<{ suggestions?: RelatedSuggestionResponse[]; taskId?: string; streamUrl?: string; cached: boolean }>(`/api/tickets/${enc(key)}/related-suggestions`, { method: "POST", signal }),
  applyRelatedSuggestions: (key: string, data: { output: string }, signal?: AbortSignal) =>
    apiFetch<{ suggestions: RelatedSuggestionResponse[] }>(`/api/tickets/${enc(key)}/related-suggestions`, { method: "PUT", body: data, signal }),
  dismissRelatedSuggestion: (key: string, data: { id: string }, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/related-suggestions`, { method: "DELETE", body: data, signal }),
  clearRelatedSuggestions: (key: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/tickets/${enc(key)}/related-suggestions`, { method: "DELETE", signal }),

  // Ticket search (for autocomplete + the Link issue filter bar, BRDG-396)
  searchForLink: (query: string, excludeKey?: string, offset?: number, filters?: LinkSearchFilters, signal?: AbortSignal) =>
    apiFetch<LinkSearchResponse>(`/api/tickets/search${qs({ q: query, exclude: excludeKey, jira: "0", offset: offset ? String(offset) : undefined, ...linkFilterParams(filters) })}`, { signal }),
  searchForLinkWithJira: (query: string, excludeKey?: string, offset?: number, filters?: LinkSearchFilters, signal?: AbortSignal) =>
    apiFetch<LinkSearchResponse>(`/api/tickets/search${qs({ q: query, exclude: excludeKey, offset: offset ? String(offset) : undefined, ...linkFilterParams(filters) })}`, { signal }),
  recentlyUpdated: (excludeKey?: string, offset?: number, filters?: LinkSearchFilters, signal?: AbortSignal) =>
    apiFetch<LinkSearchResponse>(`/api/tickets/search${qs({ recent: "1", exclude: excludeKey, offset: offset ? String(offset) : undefined, ...linkFilterParams(filters) })}`, { signal }),
  // Issues mentioned in this ticket's description/comments but not yet formally
  // linked (BRDG-433); shaped like the search rows so the picker renders them as-is.
  referencedIssues: (key: string, signal?: AbortSignal) =>
    apiFetch<{ results: LinkSearchResult[] }>(`/api/tickets/${enc(key)}/referenced-issues`, { signal }),

  suggestSubtasks: (ticketKey: string, signal?: AbortSignal) =>
    apiFetch<{ taskId: string; streamUrl: string }>(
      `/api/tickets/${enc(ticketKey)}/suggest-subtasks`, { method: "POST", signal },
    ),

  // Stakeholder test documentation (BRDG-426)
  generateTestDoc: (ticketKey: string, signal?: AbortSignal) =>
    apiFetch<{ taskId: string; streamUrl: string }>(
      `/api/tickets/${enc(ticketKey)}/generate-test-doc`, { method: "POST", signal },
    ),
  getTestDoc: (ticketKey: string, signal?: AbortSignal) =>
    apiFetch<{
      storyUpdatedAt: string | null;
      saved: { markdown: string; classification: string; updatedAt: string | null } | null;
      draft: { markdown: string; classification: string; generatedAt: string | null } | null;
    }>(`/api/tickets/${enc(ticketKey)}/test-doc`, { signal }),
  saveTestDoc: (ticketKey: string, data: { markdown: string; classification?: string }, signal?: AbortSignal) =>
    apiFetch<{ saved: boolean; pushed?: boolean; conflict?: boolean; message?: string }>(
      `/api/tickets/${enc(ticketKey)}/test-doc`, { method: "PUT", body: data, signal },
    ),
  saveTestDocDraft: (ticketKey: string, data: { markdown: string; classification?: string }, signal?: AbortSignal) =>
    apiFetch<{ saved: boolean }>(
      `/api/tickets/${enc(ticketKey)}/test-doc-draft`, { method: "PUT", body: data, signal },
    ),
  markTestDocNotNeeded: (ticketKey: string, signal?: AbortSignal) =>
    apiFetch<{ saved: boolean; notNeeded: boolean }>(
      `/api/tickets/${enc(ticketKey)}/test-doc`, { method: "PUT", body: { notNeeded: true }, signal },
    ),

  // Subtask suggestions (persisted AI suggestions)
  getSubtaskSuggestions: (key: string, signal?: AbortSignal) =>
    apiFetch<{ suggestions: SubtaskSuggestionResponse[] }>(
      `/api/tickets/${enc(key)}/subtask-suggestions`, { signal },
    ),
  persistSubtaskSuggestions: (key: string, data: { suggestions: string[] }, signal?: AbortSignal) =>
    apiFetch<{ suggestions: SubtaskSuggestionResponse[] }>(
      `/api/tickets/${enc(key)}/subtask-suggestions`, { method: "PUT", body: data, signal },
    ),
  dismissSubtaskSuggestion: (key: string, data: { id: string }, signal?: AbortSignal) =>
    apiFetch<void>(
      `/api/tickets/${enc(key)}/subtask-suggestions`, { method: "DELETE", body: data, signal },
    ),
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
  // Auto-chained targeted related search from a chat <related-request> tag (BRDG-397).
  relatedRequest: (key: string, data: { query: string; sprint: string | null }, signal?: AbortSignal) =>
    apiFetch<{ taskId: string; streamUrl: string; sprintId: string | null; sprintName: string | null }>(
      `/api/tickets/${enc(key)}/story-writer/related-request`, { method: "POST", body: data, signal },
    ),

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
// Epic Writer (epic mode of the Story Writer)
// ---------------------------------------------------------------------------

export const epicWriter = {
  getSession: (key: string, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/epics/${enc(key)}/writer/session`, { signal }),
  createSession: (key: string, data?: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/epics/${enc(key)}/writer/session`, { method: "POST", body: data, signal }),
  setPhase: (key: string, data: { phase: string }, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/epics/${enc(key)}/writer/phase`, { method: "PATCH", body: data, signal }),
  sendMessage: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/epics/${enc(key)}/writer/messages`, { method: "POST", body: data, signal }),
  applyOutput: (key: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/epics/${enc(key)}/writer/apply-output`, { method: "POST", body: data, signal }),
  updateCard: (key: string, index: number, data: { body: string | null }, signal?: AbortSignal) =>
    apiFetch<unknown>(`/api/epics/${enc(key)}/writer/cards/${index}`, { method: "PATCH", body: data, signal }),
  createInJira: (key: string, data: { cardIndex: number; placement?: string }, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean; cardIndex: number; jiraKey: string; alreadyCreated?: boolean }>(
      `/api/epics/${enc(key)}/writer/create-in-jira`, { method: "POST", body: data, signal },
    ),
  linkChildren: (
    key: string,
    data: { sourceIndex: number; targetIndex: number; relation: string },
    signal?: AbortSignal,
  ) =>
    apiFetch<{ ok: boolean; sourceKey: string; destKey: string; relation: string }>(
      `/api/epics/${enc(key)}/writer/link-children`, { method: "POST", body: data, signal },
    ),
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

  create: (data: { title: string; description?: string }, signal?: AbortSignal) =>
    apiFetch<{ key: string }>("/api/epics", { method: "POST", body: data, signal }),

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

  setTeams: (key: string, teams: string[], signal?: AbortSignal) =>
    apiFetch<{ epicKey: string; teams: string[] }>(
      `/api/epics/${enc(key)}/teams`, { method: "PUT", body: { teams }, signal },
    ),

  setColor: (key: string, color: string | null, signal?: AbortSignal) =>
    apiFetch<{ epicKey: string; color: string | null }>(
      `/api/epics/${enc(key)}/color`, { method: "PUT", body: { color }, signal },
    ),
};

// ---------------------------------------------------------------------------
// Placeholder tickets (BRDG-304) - Bridge-local forward-planning stand-ins
// ---------------------------------------------------------------------------

export const placeholders = {
  listUrl: (opts?: { sprintId?: string | null; epicKey?: string | null }) =>
    `/api/placeholders${qs({ sprintId: opts?.sprintId, epicKey: opts?.epicKey })}`,

  list: (opts?: { sprintId?: string | null; epicKey?: string | null }, signal?: AbortSignal) =>
    apiFetch<PlaceholderTicket[]>(`/api/placeholders${qs({ sprintId: opts?.sprintId, epicKey: opts?.epicKey })}`, { signal }),

  create: (data: Partial<PlaceholderTicket> & { title: string }, signal?: AbortSignal) =>
    apiFetch<PlaceholderTicket>("/api/placeholders", { method: "POST", body: data, signal }),

  update: (id: string, data: Partial<PlaceholderTicket>, signal?: AbortSignal) =>
    apiFetch<PlaceholderTicket>(`/api/placeholders/${enc(id)}`, { method: "PATCH", body: data, signal }),

  remove: (id: string, signal?: AbortSignal) =>
    apiFetch<{ ok: true }>(`/api/placeholders/${enc(id)}`, { method: "DELETE", signal }),

  promote: (id: string, signal?: AbortSignal) =>
    apiFetch<{ key: string }>(`/api/placeholders/${enc(id)}/promote`, { method: "POST", signal }),

  reorder: (orderedIds: string[], signal?: AbortSignal) =>
    apiFetch<{ ok: true }>("/api/placeholders/reorder", { method: "POST", body: { orderedIds }, signal }),
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
  cancel: (id: string, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>(`/api/workspace-tasks/${enc(id)}/cancel`, { method: "POST", signal }),
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
  linkTypesUrl: () => "/api/jira/link-types" as const,

  // -- Actions --
  getLinkTypes: (signal?: AbortSignal) =>
    apiFetch<{ linkTypes: import("@/app/api/jira/link-types/route").LinkTypeOption[] }>("/api/jira/link-types", { signal }),
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
  watcherCandidatesUrl: () => "/api/jira/watcher-candidates" as const,
  watchersUrl: (issueKey: string) => `/api/jira/watchers${qs({ issueKey })}`,
  getWatchers: (issueKey: string, signal?: AbortSignal) =>
    apiFetch<{ watchers: { accountId: string; displayName: string; avatarUrl: string | null }[] }>(
      `/api/jira/watchers${qs({ issueKey })}`, { signal },
    ),
  addWatcher: (data: { issueKey: string; accountId: string }, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>("/api/jira/watchers", { method: "POST", body: data, signal }),
  removeWatcher: (data: { issueKey: string; accountId: string }, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>(`/api/jira/watchers${qs({ issueKey: data.issueKey, accountId: data.accountId })}`, { method: "DELETE", signal }),
  updateSprint: (sprintId: string, data: { name?: string; goal?: string; startDate?: string; endDate?: string }, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>(`/api/jira/sprints/${encodeURIComponent(sprintId)}`, { method: "PUT", body: data, signal }),
  createSprint: (data: { name: string; startDate?: string; endDate?: string; goal?: string }, signal?: AbortSignal) =>
    apiFetch<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null; goal: string | null }>(
      "/api/jira/sprints", { method: "POST", body: data, signal },
    ),
  closeSprint: (sprintId: string, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>(`/api/jira/sprints/${encodeURIComponent(sprintId)}/close`, { method: "POST", signal }),
  startSprint: (sprintId: string, data: { startDate?: string | null; endDate: string }, signal?: AbortSignal) =>
    apiFetch<{ ok: boolean; startDate: string; endDate: string }>(
      `/api/jira/sprints/${encodeURIComponent(sprintId)}/start`, { method: "POST", body: data, signal },
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
  // Inline sprint-board deep-field key match (BRDG-345): returns the keys of every ticket
  // matching the query across description, acceptance criteria, labels, notes and comments.
  localKeys: (q: string, signal?: AbortSignal) =>
    apiFetch<{ keys: string[] }>(`/api/search/local/keys${qs({ q })}`, { signal }),
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

// One registered scheduler task as exposed by GET /api/scheduler/tasks (and
// GET /api/scheduler/tick). `enabled` is the EFFECTIVE state (persisted override
// or the task's default).
export interface SchedulerTaskStatus {
  name: string;
  label: string;
  description: string;
  intervalMs: number;
  enabled: boolean;
}

export const scheduler = {
  tick: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/scheduler/tick", { method: "POST", signal }),
  status: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/scheduler/tick", { signal }),
  run: (name: string, signal?: AbortSignal) =>
    apiFetch<{ ran: boolean; result: unknown }>(`/api/scheduler/run/${enc(name)}`, { method: "POST", signal }),
  tasks: (signal?: AbortSignal) =>
    apiFetch<{ tasks: SchedulerTaskStatus[] }>("/api/scheduler/tasks", { signal }),
  setTaskEnabled: (name: string, enabled: boolean, signal?: AbortSignal) =>
    apiFetch<{ name: string; enabled: boolean }>("/api/scheduler/tasks", {
      method: "POST",
      body: { name, enabled },
      signal,
    }),
};

// ---------------------------------------------------------------------------
// Refinement Sessions
// ---------------------------------------------------------------------------

export type RefinementSessionStatus = "draft" | "in_progress" | "completed";

export interface RefinementSessionResponse {
  id: string;
  name: string | null;
  ticketKeys: string[];
  ticketCount: number;
  status: RefinementSessionStatus;
  generalComment: string | null;
  scheduledFor: string | null;
  currentIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface RefinementSessionTicketNoteResponse {
  id: string;
  sessionId: string;
  ticketKey: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export const refinementSessions = {
  listUrl: () => "/api/refinement-sessions" as const,
  detailUrl: (id: string) => `/api/refinement-sessions/${enc(id)}`,

  list: (signal?: AbortSignal) =>
    apiFetch<RefinementSessionResponse[]>("/api/refinement-sessions", { signal }),
  create: (data: { name?: string; scheduledFor?: string; ticketKeys?: string[] }, signal?: AbortSignal) =>
    apiFetch<RefinementSessionResponse>("/api/refinement-sessions", { method: "POST", body: data, signal }),
  get: (id: string, signal?: AbortSignal) =>
    apiFetch<RefinementSessionResponse>(`/api/refinement-sessions/${enc(id)}`, { signal }),
  update: (id: string, data: Partial<{ name: string | null; ticketKeys: string[]; status: RefinementSessionStatus; generalComment: string | null; scheduledFor: string | null; currentIndex: number }>, signal?: AbortSignal) =>
    apiFetch<RefinementSessionResponse>(`/api/refinement-sessions/${enc(id)}`, { method: "PATCH", body: data, signal }),
  delete: (id: string, signal?: AbortSignal) =>
    apiFetch<void>(`/api/refinement-sessions/${enc(id)}`, { method: "DELETE", signal }),

  // Per-ticket PO notes within a session
  ticketNotes: (id: string, signal?: AbortSignal) =>
    apiFetch<RefinementSessionTicketNoteResponse[]>(`/api/refinement-sessions/${enc(id)}/ticket-notes`, { signal }),
  upsertTicketNote: (id: string, data: { ticketKey: string; content: string }, signal?: AbortSignal) =>
    apiFetch<RefinementSessionTicketNoteResponse | void>(`/api/refinement-sessions/${enc(id)}/ticket-notes`, { method: "PUT", body: data, signal }),

  // Bulk subtask suggestions
  bulkSuggestSubtasks: (id: string, data?: { force?: boolean }, signal?: AbortSignal) =>
    apiFetch<{ conversationId: string }>(`/api/refinement-sessions/${enc(id)}/bulk-suggest-subtasks`, { method: "POST", body: data ?? {}, signal }),
  bulkSuggestStatus: (id: string, signal?: AbortSignal) =>
    apiFetch<{ conversationId: string | null; hasRun: boolean; isRunning: boolean }>(`/api/refinement-sessions/${enc(id)}/bulk-suggest-subtasks`, { signal }),
  suggestionCounts: (id: string, signal?: AbortSignal) =>
    apiFetch<{ counts: Record<string, number> }>(`/api/refinement-sessions/${enc(id)}/suggestion-counts`, { signal }),
  suggestionCountsUrl: (id: string | null) =>
    id ? `/api/refinement-sessions/${enc(id)}/suggestion-counts` : null,
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
  defaultSprintUrl: () => "/api/settings/default-sprint" as const,

  // -- Actions --
  getColumnWidths: (signal?: AbortSignal) =>
    apiFetch<{ widths: Record<string, number> }>("/api/settings/column-widths", { signal }),
  saveColumnWidths: (widths: Record<string, number>, signal?: AbortSignal) =>
    apiFetch<{ widths: Record<string, number> }>("/api/settings/column-widths", { method: "PUT", body: { widths }, signal }),

  getColumnConfig: (signal?: AbortSignal) =>
    apiFetch<unknown>("/api/settings/column-config", { signal }),
  saveColumnConfig: (config: unknown, signal?: AbortSignal) =>
    apiFetch<void>("/api/settings/column-config", { method: "PUT", body: config, signal }),

  getSectionVisibility: (section: string, signal?: AbortSignal) =>
    apiFetch<{ visible: string[] | null; allKnown?: string[] | null }>(`/api/settings/section-visibility?section=${encodeURIComponent(section)}`, { signal }),
  saveSectionVisibility: (section: string, visible: string[], allKnown?: string[], signal?: AbortSignal) =>
    apiFetch<{ visible: string[] }>("/api/settings/section-visibility", { method: "PUT", body: { section, visible, allKnown }, signal }),

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

  getDefaultSprint: (signal?: AbortSignal) =>
    apiFetch<{ sprintId: string }>("/api/settings/default-sprint", { signal }),
  saveDefaultSprint: (sprintId: string, signal?: AbortSignal) =>
    apiFetch<{ sprintId: string }>("/api/settings/default-sprint", { method: "PUT", body: { sprintId }, signal }),
};

// ---------------------------------------------------------------------------
// Deprecated areas (BRDG-285) — editable keyword list for the "replaced area"
// deep-scan topic.
// ---------------------------------------------------------------------------

export interface DeprecatedAreaItem {
  id: string;
  term: string;
  aliases: string;
  note: string;
  createdAt: string;
}

export const deprecatedAreas = {
  list: (signal?: AbortSignal) =>
    apiFetch<{ areas: DeprecatedAreaItem[] }>("/api/cleanup/deprecated-areas", { signal }),
  add: (input: { term: string; aliases?: string; note?: string }, signal?: AbortSignal) =>
    apiFetch<{ area: DeprecatedAreaItem }>("/api/cleanup/deprecated-areas", { method: "POST", body: input, signal }),
  update: (input: { id: string; term: string; aliases?: string; note?: string }, signal?: AbortSignal) =>
    apiFetch<{ area: DeprecatedAreaItem }>("/api/cleanup/deprecated-areas", { method: "PUT", body: input, signal }),
  remove: (id: string, signal?: AbortSignal) =>
    apiFetch<void>("/api/cleanup/deprecated-areas", { method: "DELETE", body: { id }, signal }),
};

// ---------------------------------------------------------------------------
// Auto scan settings (BRDG-290)
// ---------------------------------------------------------------------------

export interface AutoScanSettings {
  enabled: boolean;
  dailyCount: number;
}

export const autoScanSettings = {
  get: (signal?: AbortSignal) =>
    apiFetch<AutoScanSettings>("/api/cleanup/auto-scan-settings", { signal }),
  update: (data: Partial<AutoScanSettings>, signal?: AbortSignal) =>
    apiFetch<AutoScanSettings>("/api/cleanup/auto-scan-settings", { method: "POST", body: data, signal }),
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
// Favorite Users & Team Assignments
// ---------------------------------------------------------------------------

export const favoriteUsers = {
  listUrl: () => "/api/settings/favorite-users" as const,

  list: (signal?: AbortSignal) =>
    apiFetch<{ favorites: string[] }>("/api/settings/favorite-users", { signal }),
  add: (displayName: string, accountId?: string | null, signal?: AbortSignal) =>
    apiFetch<{ displayName: string }>("/api/settings/favorite-users", { method: "POST", body: { displayName, ...(accountId ? { accountId } : {}) }, signal }),
  remove: (displayName: string, accountId?: string | null, signal?: AbortSignal) =>
    apiFetch<{ displayName: string }>(`/api/settings/favorite-users${qs({ displayName, accountId: accountId ?? undefined })}`, { method: "DELETE", signal }),
};

export const poUsers = {
  listUrl: () => "/api/settings/po-users" as const,

  list: (signal?: AbortSignal) =>
    apiFetch<{ pos: string[]; accountIds: string[] }>("/api/settings/po-users", { signal }),
  add: (displayName: string, accountId?: string | null, signal?: AbortSignal) =>
    apiFetch<{ displayName: string }>("/api/settings/po-users", { method: "POST", body: { displayName, ...(accountId ? { accountId } : {}) }, signal }),
  remove: (displayName: string, accountId?: string | null, signal?: AbortSignal) =>
    apiFetch<{ displayName: string }>(`/api/settings/po-users${qs({ displayName, accountId: accountId ?? undefined })}`, { method: "DELETE", signal }),
};

export const userTeams = {
  listUrl: () => "/api/settings/user-teams" as const,

  list: (signal?: AbortSignal) =>
    apiFetch<{ assignments: Array<{ displayName: string; teams: string[] }> }>("/api/settings/user-teams", { signal }),
  set: (displayName: string, teams: string[], accountId?: string | null, signal?: AbortSignal) =>
    apiFetch<{ displayName: string; teams: string[] }>("/api/settings/user-teams", { method: "PUT", body: { displayName, teams, ...(accountId ? { accountId } : {}) }, signal }),
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
// Inbox digest (BRDG-413) - twice-daily new-ticket digest banner
// ---------------------------------------------------------------------------

export interface InboxDigestBucket {
  key: string;
  label: string;
  count: number;
}

export interface ActiveInboxDigest {
  id: string;
  generatedAt: string;
  baselineAt: string | null;
  total: number;
  buckets: InboxDigestBucket[];
}

export interface InboxDigestResponse {
  active: ActiveInboxDigest | null;
}

export const inboxDigest = {
  url: () => "/api/inbox/digest" as const,

  get: (signal?: AbortSignal) =>
    apiFetch<InboxDigestResponse>("/api/inbox/digest", { signal }),
  dismiss: (signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>("/api/inbox/digest", { method: "DELETE", signal }),
  snooze: (signal?: AbortSignal) =>
    apiFetch<{ ok: boolean }>("/api/inbox/digest", { method: "POST", signal }),
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
// Sprints
// ---------------------------------------------------------------------------

// Sprint-level test documentation bundle (BRDG-461).
export interface SprintTestDocItem {
  key: string;
  title: string;
  status: string;
  storyPoints: number | null;
  doc: string | null;
  needsInput?: boolean;
}

export interface SprintTestDocs {
  sprintName: string;
  documented: SprintTestDocItem[];
  internal: SprintTestDocItem[];
  notNeeded: SprintTestDocItem[];
  missing: SprintTestDocItem[];
  other: SprintTestDocItem[];
}

export const sprints = {
  testDocsUrl: (sprintId: string) =>
    `/api/sprints/${encodeURIComponent(sprintId)}/test-docs` as const,
  testDocs: (sprintId: string, signal?: AbortSignal) =>
    apiFetch<SprintTestDocs>(`/api/sprints/${encodeURIComponent(sprintId)}/test-docs`, { signal }),
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
