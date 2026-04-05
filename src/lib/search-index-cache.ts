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
  localEditTitle: string;
  localEditDescription: string;
  notes: string;
  tags: string;
  jiraCommentBodies: string;
  poCommentBodies: string;
}

const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  threshold: 0.4,
  ignoreLocation: true,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  keys: [
    { name: "key", weight: 1.0 },
    { name: "summary", weight: 0.85 },
    { name: "localEditTitle", weight: 0.8 },
    { name: "assignee", weight: 0.8 },
    { name: "labels", weight: 0.6 },
    { name: "notes", weight: 0.55 },
    { name: "tags", weight: 0.5 },
    { name: "description", weight: 0.45 },
    { name: "localEditDescription", weight: 0.45 },
    { name: "reporter", weight: 0.35 },
    { name: "poCommentBodies", weight: 0.25 },
    { name: "status", weight: 0.2 },
    { name: "priority", weight: 0.2 },
    { name: "jiraCommentBodies", weight: 0.15 },
  ],
};

export type FuseResultMatchType = FuseResultMatch;

export interface TicketDetail {
  jiraKey: string;
  type: string | null;
  epic: string | null;
  epicKey: string | null;
  storyPoints: number | null;
  jiraUpdatedAt: string | null;
}

interface CacheEntry {
  fuse: Fuse<SearchDoc>;
  docs: SearchDoc[];
  ticketDetails: Map<string, TicketDetail>;
  sprintIdToName: Map<string, string>;
  jiraBaseUrl: string;
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
): CacheEntry {
  const fuse = new Fuse(docs, FUSE_OPTIONS);
  cache = { fuse, docs, ticketDetails, sprintIdToName, jiraBaseUrl, builtAt: Date.now() };
  return cache;
}

export function invalidateSearchCache(): void {
  cache = null;
}

export { FUSE_OPTIONS };
