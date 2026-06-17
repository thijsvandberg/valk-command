import { db } from "@/db";
import { ticket, ticketMetadata, jiraComment, poComment, ticketLocalEdit, appSetting, conversation, message } from "@/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { env } from "@/lib/env";
import {
  getSearchCache,
  setSearchCache,
  TICKET_SEARCH_KEYS,
  CONVERSATION_SEARCH_KEYS,
  COMMENT_SEARCH_KEYS,
  type WeightedKey,
  type SearchDoc,
  type TicketDetail,
  type FuseResultMatchType,
  type ConversationSearchDoc,
  type CommentSearchDoc,
} from "@/lib/search-index-cache";
import { logger } from "@/lib/logger";
import type { TicketReadiness } from "@/types/ticket";

export interface LocalSearchResult {
  key: string;
  summary: string;
  status: string;
  poStatus: string | null;
  readiness: TicketReadiness | null;
  issueType: string | null;
  assignee: string | null;
  sprintId: string | null;
  sprintName: string | null;
  labels: string | null;
  epic: string | null;
  epicKey: string | null;
  description: string | null;
  acceptanceCriteria: string | null;
  jiraUrl: string | null;
  storyPoints: number | null;
  reporter: string | null;
  updatedAt: string | null;
  score: number;
  matches: readonly FuseResultMatchType[] | undefined;
}

export interface ConversationSearchResult {
  id: string;
  title: string;
  type: string;
  relatedTicket: string | null;
  createdAt: string;
  messageSnippet: string | null;
  score: number;
}

export interface CommentSearchResult {
  id: string;
  ticketKey: string;
  author: string;
  content: string;
  source: "jira" | "po";
  createdAt: string;
  score: number;
}

export interface GroupedSearchResponse {
  groups: {
    tickets: LocalSearchResult[];
    conversations: ConversationSearchResult[];
    comments: CommentSearchResult[];
  };
  results: LocalSearchResult[];
}

export interface SearchParams {
  q: string;
  statusFilter: string[];
  poStatusFilter: string[];
  readinessFilter: string[];
  typeFilter: string[];
  assigneeFilter: string[];
  sprintFilter: string[];
  dateRange: string | null;
}

// Jira issue types arrive as display strings ("Sub-task", "Subtask", "Story", ...).
// Normalize to a compact lowercase token so filter comparisons are robust to spacing/hyphens.
function normalizeType(t: string | null | undefined): string | null {
  return t ? t.toLowerCase().replace(/[\s-]/g, "") : null;
}

function stripAdf(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return adfToMarkdown(parsed);
    }
  } catch {
    // Not JSON
  }
  return raw;
}

// When the whole query is wrapped in double quotes, the user wants a literal phrase match
// (no fuzzy scoring). Returns the unquoted inner phrase, or null for a normal fuzzy query.
function extractExactPhrase(q: string): string | null {
  const trimmed = q.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1).trim();
    return inner.length > 0 ? inner : null;
  }
  return null;
}

interface ExactSearchResult<T> {
  item: T;
  score: number;
  matches: FuseResultMatchType[];
}

// Case-insensitive substring match of a literal phrase across weighted fields. Mirrors the
// shape Fuse.search() returns (item/score/matches) so callers stay identical, but ranks by
// the best-matching field's weight instead of fuzzy distance. Lower score = better (Fuse convention).
function exactPhraseSearch<T>(
  docs: readonly T[],
  phrase: string,
  keys: readonly WeightedKey<T>[],
  limit: number,
): ExactSearchResult<T>[] {
  const needle = phrase.toLowerCase();
  const results: ExactSearchResult<T>[] = [];

  for (const item of docs) {
    let bestWeight = 0;
    const matches: FuseResultMatchType[] = [];

    for (const { name, weight } of keys) {
      const raw = (item as Record<string, unknown>)[name];
      if (typeof raw !== "string" || raw.length === 0) continue;
      const idx = raw.toLowerCase().indexOf(needle);
      if (idx === -1) continue;
      const indices: readonly [number, number][] = [[idx, idx + needle.length - 1]];
      matches.push({ key: name, value: raw, indices });
      if (weight > bestWeight) bestWeight = weight;
    }

    if (matches.length > 0) {
      results.push({ item, score: 1 - bestWeight, matches });
    }
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit);
}

// Inline sprint-board search (BRDG-345): returns the keys of every ticket whose indexed
// document contains the query as a case-insensitive substring across any weighted field
// (title, description, acceptance criteria, labels, notes, PO + Jira comments, ...). Unlike
// executeLocalSearch this does NOT rank, slice, or fuzzy-match — the board needs the full
// matching set so it can intersect it with the currently filtered rows. Reuses the same
// index/cache the Cmd+K modal uses so both stay in sync.
export async function executeLocalKeyMatch(q: string): Promise<string[]> {
  if (q.trim().length < 2) return [];

  try {
    const entry = getSearchCache() ?? (await buildIndex());
    const needle = q.trim().toLowerCase();
    const keys: string[] = [];

    for (const doc of entry.docs) {
      const hit = TICKET_SEARCH_KEYS.some(({ name }) => {
        const raw = doc[name];
        return typeof raw === "string" && raw.toLowerCase().includes(needle);
      });
      if (hit) keys.push(doc.key);
    }

    return keys;
  } catch (err) {
    logger.error("search-local", "key match failed", err);
    throw err;
  }
}

async function buildIndex() {
  const [tickets, metadataRows, jiraCommentRows, poCommentRows, localEditRows, sprintSetting, conversationRows, messageRows] =
    await Promise.all([
      // Sub-tasks are deliberately excluded from the search index: they dominate the row count
      // (~35k of ~44k) and bloat the in-memory index without adding search value. They stay in
      // the db and remain visible elsewhere in Bridge; only free-text search (Cmd+K + inline
      // board) skips them. Match the normalized type so display variants ("Sub-task", "Subtask")
      // are all caught regardless of how Jira sent them.
      db
        .select()
        .from(ticket)
        .where(
          and(
            notInArray(ticket.status, ["DRAFTING", "REPLACED", "DRAFT_FAILED"]),
            sql`lower(replace(replace(coalesce(${ticket.type}, ''), ' ', ''), '-', '')) != 'subtask'`,
          ),
        ),
      db.select().from(ticketMetadata).all(),
      db.select().from(jiraComment).all(),
      db.select().from(poComment).all(),
      db.select().from(ticketLocalEdit).all(),
      db.select().from(appSetting).where(eq(appSetting.key, "jira_sprints")).get(),
      db.select().from(conversation).all(),
      db.select().from(message).all(),
    ]);

  const sprintIdToName = new Map<string, string>();
  if (sprintSetting) {
    try {
      const parsed = JSON.parse(sprintSetting.value) as { id: number; name: string }[];
      for (const s of parsed) {
        sprintIdToName.set(String(s.id), s.name);
      }
    } catch {
      // Malformed cache
    }
  }

  const metaByKey = new Map(metadataRows.map((m) => [m.jiraKey, m]));

  const jiraCommentsByKey = new Map<string, string[]>();
  for (const c of jiraCommentRows) {
    const existing = jiraCommentsByKey.get(c.ticketKey) ?? [];
    existing.push(stripAdf(c.content));
    jiraCommentsByKey.set(c.ticketKey, existing);
  }

  const poCommentsByKey = new Map<string, string[]>();
  for (const c of poCommentRows) {
    const existing = poCommentsByKey.get(c.ticketKey) ?? [];
    existing.push(c.content);
    poCommentsByKey.set(c.ticketKey, existing);
  }

  const localEditsByKey = new Map<string, { title?: string; description?: string }>();
  for (const e of localEditRows) {
    const existing = localEditsByKey.get(e.ticketKey) ?? {};
    if (e.field === "title") existing.title = e.localValue;
    else if (e.field === "description") existing.description = e.localValue;
    localEditsByKey.set(e.ticketKey, existing);
  }

  const docs: SearchDoc[] = tickets.map((t) => {
    const meta = metaByKey.get(t.jiraKey);
    const localEdits = localEditsByKey.get(t.jiraKey);
    return {
      key: t.jiraKey,
      summary: t.title,
      status: t.status,
      priority: t.priority ?? null,
      assignee: t.assignee ?? null,
      reporter: t.reporter ?? null,
      sprintName: t.sprintName ?? null,
      labels: t.labels ?? "",
      description: stripAdf(t.description),
      acceptanceCriteria: stripAdf(t.acceptanceCriteria),
      localEditTitle: localEdits?.title ?? "",
      localEditDescription: stripAdf(localEdits?.description),
      notes: meta?.poNotes ?? "",
      tags: t.labels ?? "",
      jiraCommentBodies: (jiraCommentsByKey.get(t.jiraKey) ?? []).join(" "),
      poCommentBodies: (poCommentsByKey.get(t.jiraKey) ?? []).join(" "),
    };
  });

  const ticketDetails = new Map<string, TicketDetail>(
    tickets.map((t) => {
      const meta = metaByKey.get(t.jiraKey);
      return [
        t.jiraKey,
        {
          jiraKey: t.jiraKey,
          type: t.type ?? null,
          epic: t.epic ?? null,
          epicKey: t.epicKey ?? null,
          storyPoints: t.storyPoints ?? null,
          jiraUpdatedAt: t.jiraUpdatedAt ?? null,
          poStatus: meta?.poStatus ?? null,
          readiness: meta?.readiness ?? null,
        },
      ];
    })
  );

  const messagesByConversation = new Map<string, string[]>();
  for (const msg of messageRows) {
    const existing = messagesByConversation.get(msg.conversationId) ?? [];
    existing.push(msg.content);
    messagesByConversation.set(msg.conversationId, existing);
  }

  const conversationDocs: ConversationSearchDoc[] = conversationRows.map((c) => {
    const bodies = (messagesByConversation.get(c.id) ?? []).join(" ");
    return {
      id: c.id,
      title: c.title,
      type: c.type,
      relatedTicket: c.relatedTicket ?? null,
      createdAt: c.createdAt,
      messageBodies: bodies.slice(0, 5000),
    };
  });

  const commentDocs: CommentSearchDoc[] = [
    ...jiraCommentRows.map((c) => ({
      id: c.id,
      ticketKey: c.ticketKey,
      author: c.authorName,
      content: stripAdf(c.content),
      source: "jira" as const,
      createdAt: c.createdAt,
    })),
    ...poCommentRows.map((c) => ({
      id: c.id,
      ticketKey: c.ticketKey,
      author: c.author,
      content: c.content,
      source: "po" as const,
      createdAt: c.createdAt,
    })),
  ];

  const jiraBaseUrl = env.JIRA_BASE_URL;
  return setSearchCache(docs, ticketDetails, sprintIdToName, jiraBaseUrl, conversationDocs, commentDocs);
}

const EMPTY_RESPONSE: GroupedSearchResponse = {
  groups: { tickets: [], conversations: [], comments: [] },
  results: [],
};

export async function executeLocalSearch(params: SearchParams): Promise<GroupedSearchResponse> {
  const { q, statusFilter, poStatusFilter, readinessFilter, typeFilter, assigneeFilter, sprintFilter, dateRange } = params;

  if (q.trim().length < 2) return EMPTY_RESPONSE;

  try {
    const entry = getSearchCache() ?? (await buildIndex());
    const { fuse, docs, ticketDetails, sprintIdToName, jiraBaseUrl, conversationFuse, conversationDocs, commentFuse, commentDocs } = entry;

    const exactPhrase = extractExactPhrase(q);
    const tokens = q.trim().split(/\s+/).filter((t) => t.length >= 2);
    const hasFilters = statusFilter.length > 0 || poStatusFilter.length > 0 || readinessFilter.length > 0 || typeFilter.length > 0 || assigneeFilter.length > 0 || sprintFilter.length > 0 || !!dateRange;
    const fuseLimit = hasFilters ? 500 : 200;
    const fuseResults = exactPhrase
      ? exactPhraseSearch(docs, exactPhrase, TICKET_SEARCH_KEYS, fuseLimit)
      : fuse.search(tokens[0] ?? q, { limit: fuseLimit });

    if (!exactPhrase && tokens.length > 1) {
      const additionalMaps = tokens.slice(1).map((token) => {
        return new Map(fuse.search(token, { limit: 200 }).map((r) => [r.item.key, r.score ?? 1]));
      });

      for (const r of fuseResults) {
        const matchingTokenCount = additionalMaps.filter((m) => m.has(r.item.key)).length;
        if (matchingTokenCount === additionalMaps.length) {
          const otherAvg =
            additionalMaps.reduce((sum, m) => sum + (m.get(r.item.key) ?? 1), 0) /
            additionalMaps.length;
          r.score = (((r.score ?? 1) + otherAvg) / 2) * 0.55;
        } else if (matchingTokenCount > 0) {
          r.score = (r.score ?? 1) * 0.85;
        }
      }

      fuseResults.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
    }

    const sortedSprintIds = [...sprintIdToName.keys()].sort((a, b) => parseInt(b) - parseInt(a));
    const activeSprintIds = new Set(sortedSprintIds.slice(0, 2));

    const now = Date.now();

    const mapped: LocalSearchResult[] = fuseResults.map((r) => {
      const detail = ticketDetails.get(r.item.key);
      let score = r.score ?? 1;

      if (detail?.jiraUpdatedAt) {
        const daysSince = (now - new Date(detail.jiraUpdatedAt).getTime()) / 86400000;
        if (daysSince < 7) score *= 0.82;
        else if (daysSince < 30) score *= 0.90;
        else if (daysSince > 180) score *= 1.06;
      }

      if (r.item.sprintName && activeSprintIds.has(r.item.sprintName)) {
        score *= 0.70;
      }

      const status = r.item.status?.toUpperCase();
      if (status === "DEPRECATED") {
        score *= 1.5;
      } else if (status === "DONE") {
        score *= 1.15;
      }

      return {
        key: r.item.key,
        summary: r.item.localEditTitle || r.item.summary,
        status: r.item.status,
        poStatus: detail?.poStatus ?? null,
        readiness: (detail?.readiness as TicketReadiness | null) ?? null,
        issueType: detail?.type ?? null,
        assignee: r.item.assignee,
        sprintId: r.item.sprintName ?? null,
        sprintName: r.item.sprintName
          ? (sprintIdToName.get(r.item.sprintName) ?? r.item.sprintName)
          : null,
        labels: r.item.labels || null,
        epic: detail?.epic ?? null,
        epicKey: detail?.epicKey ?? null,
        description: r.item.description || null,
        acceptanceCriteria: r.item.acceptanceCriteria || null,
        jiraUrl: jiraBaseUrl ? `${jiraBaseUrl}/browse/${r.item.key}` : null,
        storyPoints: detail?.storyPoints ?? null,
        reporter: r.item.reporter,
        updatedAt: detail?.jiraUpdatedAt ?? null,
        score,
        matches: r.matches,
      };
    });

    const tickets: LocalSearchResult[] = mapped
      .filter((r) => {
        if (statusFilter.length > 0 && !statusFilter.includes(r.status.toUpperCase())) return false;
        if (poStatusFilter.length > 0 && !(r.poStatus && poStatusFilter.some((p) => p.toLowerCase() === r.poStatus!.toLowerCase()))) return false;

        // Subtasks are excluded at the index source (see buildIndex), so they never reach here.
        const normType = normalizeType(r.issueType);
        if (typeFilter.length > 0 && !(normType && typeFilter.includes(normType))) return false;

        if (readinessFilter.length > 0) {
          const ok = r.readiness === null ? readinessFilter.includes("none") : readinessFilter.includes(r.readiness);
          if (!ok) return false;
        }
        if (assigneeFilter.length > 0 && !(r.assignee && assigneeFilter.some((a) => a.toLowerCase() === r.assignee!.toLowerCase()))) return false;
        if (sprintFilter.length > 0 && !(r.sprintId && sprintFilter.includes(r.sprintId))) return false;

        if (dateRange) {
          const updatedMs = r.updatedAt ? new Date(r.updatedAt).getTime() : null;
          if (dateRange === "7d") {
            if (!updatedMs || now - updatedMs > 7 * 86400000) return false;
          } else if (dateRange === "28d") {
            if (!updatedMs || now - updatedMs > 28 * 86400000) return false;
          } else if (dateRange.startsWith("custom:")) {
            const range = dateRange.slice(7);
            const [from, to] = range.split("..");
            if (from && updatedMs && updatedMs < new Date(from).getTime()) return false;
            if (to && updatedMs && updatedMs > new Date(to).getTime() + 86400000) return false;
          }
        }

        return true;
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 25);

    const conversationFuseResults = exactPhrase
      ? exactPhraseSearch(conversationDocs, exactPhrase, CONVERSATION_SEARCH_KEYS, 15)
      : conversationFuse.search(tokens[0] ?? q, { limit: 15 });
    const conversations: ConversationSearchResult[] = conversationFuseResults
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .map((r) => ({
        id: r.item.id,
        title: r.item.title,
        type: r.item.type,
        relatedTicket: r.item.relatedTicket,
        createdAt: r.item.createdAt,
        messageSnippet: r.item.messageBodies ? r.item.messageBodies.slice(0, 200) : null,
        score: r.score ?? 1,
      }));

    const commentFuseResults = exactPhrase
      ? exactPhraseSearch(commentDocs, exactPhrase, COMMENT_SEARCH_KEYS, 15)
      : commentFuse.search(tokens[0] ?? q, { limit: 15 });
    const comments: CommentSearchResult[] = commentFuseResults
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .map((r) => ({
        id: r.item.id,
        ticketKey: r.item.ticketKey,
        author: r.item.author,
        content: r.item.content.slice(0, 200),
        source: r.item.source,
        createdAt: r.item.createdAt,
        score: r.score ?? 1,
      }));

    return {
      groups: { tickets, conversations, comments },
      results: tickets,
    };
  } catch (err) {
    logger.error("search-local", "search failed", err);
    throw err;
  }
}
