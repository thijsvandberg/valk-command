import Fuse, { type IFuseOptions, type FuseResultMatch } from "fuse.js";

// Flat document fed to Fuse.js for a single ticket
export interface SearchDoc {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  sprintName: string | null;
  labels: string;
  description: string;
  acceptanceCriteria: string;
  localEditTitle: string;
  localEditDescription: string;
  notes: string;
  tags: string;
  jiraCommentBodies: string;
  poCommentBodies: string;
}

export interface ConversationSearchDoc {
  id: string;
  title: string;
  type: string;
  relatedTicket: string | null;
  createdAt: string;
  // Concatenated message content (truncated to 5000 chars) for full-text search
  messageBodies: string;
}

export interface CommentSearchDoc {
  id: string;
  ticketKey: string;
  author: string;
  content: string;
  source: "jira" | "po";
  createdAt: string;
}

// A searchable field plus its relevance weight. Shared between Fuse (fuzzy mode) and the
// exact-phrase matcher (quoted queries) so both rank fields the same way.
export interface WeightedKey<T> {
  name: keyof T & string;
  weight: number;
}

export const TICKET_SEARCH_KEYS: WeightedKey<SearchDoc>[] = [
  { name: "key", weight: 1.0 },
  { name: "summary", weight: 0.85 },
  { name: "localEditTitle", weight: 0.8 },
  { name: "assignee", weight: 0.8 },
  { name: "labels", weight: 0.6 },
  { name: "notes", weight: 0.55 },
  { name: "tags", weight: 0.5 },
  { name: "description", weight: 0.45 },
  { name: "acceptanceCriteria", weight: 0.4 },
  { name: "localEditDescription", weight: 0.45 },
  { name: "reporter", weight: 0.35 },
  { name: "poCommentBodies", weight: 0.25 },
  { name: "status", weight: 0.2 },
  { name: "priority", weight: 0.2 },
  { name: "jiraCommentBodies", weight: 0.15 },
];

export const CONVERSATION_SEARCH_KEYS: WeightedKey<ConversationSearchDoc>[] = [
  { name: "title", weight: 1.0 },
  { name: "relatedTicket", weight: 0.7 },
  { name: "messageBodies", weight: 0.4 },
];

export const COMMENT_SEARCH_KEYS: WeightedKey<CommentSearchDoc>[] = [
  { name: "content", weight: 1.0 },
  { name: "author", weight: 0.5 },
  { name: "ticketKey", weight: 0.6 },
];

const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  keys: TICKET_SEARCH_KEYS,
};

const CONVERSATION_FUSE_OPTIONS: IFuseOptions<ConversationSearchDoc> = {
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  includeMatches: false,
  minMatchCharLength: 2,
  keys: CONVERSATION_SEARCH_KEYS,
};

const COMMENT_FUSE_OPTIONS: IFuseOptions<CommentSearchDoc> = {
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  includeMatches: false,
  minMatchCharLength: 2,
  keys: COMMENT_SEARCH_KEYS,
};

export type FuseResultMatchType = FuseResultMatch;

export interface TicketDetail {
  jiraKey: string;
  type: string | null;
  epic: string | null;
  epicKey: string | null;
  storyPoints: number | null;
  jiraUpdatedAt: string | null;
  poStatus: string | null;
  readiness: string | null;
}

interface CacheEntry {
  fuse: Fuse<SearchDoc>;
  docs: SearchDoc[];
  ticketDetails: Map<string, TicketDetail>;
  sprintIdToName: Map<string, string>;
  jiraBaseUrl: string;
  conversationFuse: Fuse<ConversationSearchDoc>;
  conversationDocs: ConversationSearchDoc[];
  commentFuse: Fuse<CommentSearchDoc>;
  commentDocs: CommentSearchDoc[];
  builtAt: number;
}

const CACHE_TTL = 60_000; // 60 seconds

let cache: CacheEntry | null = null;

export function getSearchCache(): CacheEntry | null {
  if (!cache) return null;
  if (Date.now() - cache.builtAt > CACHE_TTL) {
    cache = null;
    return null;
  }
  return cache;
}

export function setSearchCache(
  docs: SearchDoc[],
  ticketDetails: Map<string, TicketDetail>,
  sprintIdToName: Map<string, string>,
  jiraBaseUrl: string,
  conversationDocs: ConversationSearchDoc[],
  commentDocs: CommentSearchDoc[],
): CacheEntry {
  const fuse = new Fuse(docs, FUSE_OPTIONS);
  const conversationFuse = new Fuse(conversationDocs, CONVERSATION_FUSE_OPTIONS);
  const commentFuse = new Fuse(commentDocs, COMMENT_FUSE_OPTIONS);
  cache = {
    fuse,
    docs,
    ticketDetails,
    sprintIdToName,
    jiraBaseUrl,
    conversationFuse,
    conversationDocs,
    commentFuse,
    commentDocs,
    builtAt: Date.now(),
  };
  return cache;
}

export function invalidateSearchCache(): void {
  cache = null;
}

export { FUSE_OPTIONS };
