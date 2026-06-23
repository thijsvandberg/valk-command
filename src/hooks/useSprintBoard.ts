import useSWR, { mutate as globalMutate, useSWRConfig } from "swr";
import { useRef, useMemo, useEffect, useCallback } from "react";
import type { Ticket, TicketDetail, StoredReview, StoryVersion } from "@/types/ticket";
import type { DevInfoPayload } from "@/lib/bitbucket-client";
import { swrFetcher, tickets as ticketsApi, jira as jiraApi } from "@/lib/api-client";
export { useDebouncedCallback } from "./useDebouncedCallback";

// Fetches saved sprint slot configuration with SWR caching
export function useSprintSlots() {
  return useSWR<{ slotIndex: number; sprintId: string; sprintName: string }[] | null>(
    "/api/sprint-slots",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

interface SprintData {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  goal: string | null;
  hidden?: boolean;
}

interface SprintsResponse {
  sprints: SprintData[];
  backlogCount: number;
}

// Fetches cached sprint list from the DB
export function useJiraSprints() {
  const swr = useSWR<SprintsResponse>(
    "/api/jira/sprints",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  // Derive sprints array and backlog count from the response
  const sprints = useMemo(() => swr.data?.sprints ?? [], [swr.data]);
  const backlogCount = swr.data?.backlogCount ?? 0;

  return { ...swr, sprints, backlogCount };
}

// Fetches all tickets for a sprint from the local DB.
// Pass "__all__" to fetch all tickets regardless of sprint.
// On mount (or sprint change), fires a background timestamp-first sync
// to pick up remote changes and detect deleted tickets without blocking the UI.
export function useTickets(sprintId: string | null) {
  const key =
    sprintId === "__all__"
      ? "/api/tickets"
      : sprintId
      ? `/api/tickets?sprintId=${encodeURIComponent(sprintId)}`
      : null;
  const swr = useSWR<Ticket[]>(key, swrFetcher, { revalidateOnFocus: true, dedupingInterval: 15000, refreshInterval: 60000 });
  const { mutate } = swr;

  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sprintId || sprintId === "__all__") return;
    if (syncedRef.current === sprintId) return;
    syncedRef.current = sprintId;

    let cancelled = false;

    // For backlog, use __backlog__ as the sprintId which the sync-tickets route handles
    jiraApi.syncTickets({ sprintId, strategy: "timestamp-first" })
      .then(() => { if (!cancelled) mutate(); })
      .catch(() => { /* background sync, fail silently */ });

    return () => { cancelled = true; };
  }, [sprintId, mutate]);

  return swr;
}

// Fetches full ticket detail with background staleness check.
// After returning cached data, checks Jira for updates. If stale,
// triggers a single-ticket sync and revalidates the local cache.
export function useTicketDetail(ticketKey: string | null) {
  const swr = useSWR<Ticket & TicketDetail>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const syncedRef = useRef<string | null>(null);
  const { mutate } = swr;

  // Immediately sync the full ticket from Jira in the background.
  // SWR serves local/cached data instantly; once the sync finishes
  // we revalidate so the UI updates with fresh Jira data.
  useEffect(() => {
    if (!ticketKey) return;
    if (ticketKey.startsWith("DRAFT-")) return;
    if (syncedRef.current === ticketKey) return;
    syncedRef.current = ticketKey;

    let cancelled = false;

    jiraApi.syncTickets({ ticketKeys: [ticketKey] })
      .then(() => { if (!cancelled) mutate(); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [ticketKey, mutate]);

  // When the response flags that legacy name-only child sprints are being re-synced server-side
  // (BRDG-308), revalidate the detail and the sprint list on a short bounded poll so the open page
  // resolves the sprint's dates/state on its own. Stops as soon as the flag clears or after a few
  // attempts, so an unresolvable sprint never loops forever.
  const { mutate: configMutate } = useSWRConfig();
  const resyncAttemptsRef = useRef(0);
  useEffect(() => {
    resyncAttemptsRef.current = 0;
  }, [ticketKey]);
  const resyncing = swr.data?.resyncingSprints === true;
  useEffect(() => {
    if (!resyncing) return;
    if (resyncAttemptsRef.current >= 5) return;
    const timer = setTimeout(() => {
      resyncAttemptsRef.current += 1;
      void mutate();
      void configMutate("/api/jira/sprints");
    }, 2500);
    return () => clearTimeout(timer);
  }, [resyncing, swr.data, mutate, configMutate]);

  return swr;
}

// Fetches ticket versions for the side panel (lazy: only when ticketKey is provided)
export function useTicketVersions(ticketKey: string | null) {
  return useSWR<StoryVersion[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches only version metadata to get the count without loading full content
export function useTicketVersionCount(ticketKey: string | null) {
  return useSWR<unknown[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions?metaOnly=true` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches comments (PO + Jira) for a ticket
export function useTicketComments(ticketKey: string | null) {
  return useSWR<unknown[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/comments` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches attachment metadata for a ticket
export function useTicketAttachments(ticketKey: string | null) {
  return useSWR<unknown[]>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/attachments` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Checks Jira connectivity (long interval, no need to poll frequently)
export function useJiraHealth() {
  return useSWR<{ ok: boolean; live: boolean; error?: string; cachedDataAvailable?: boolean }>(
    "/api/jira/health",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
}

export function useConfluenceHealth() {
  return useSWR<{ ok: boolean; live: boolean; error?: string }>(
    "/api/confluence/health",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
}

export function useTicketConfluenceLinks(ticketKey: string | null) {
  return useSWR<{ links: Array<{ id: string; ticketKey: string; pageId: string; pageTitle: string; pageUrl: string; source: string; lastModifiedAt: string | null; lastModifiedBy: string | null; createdAt: string }> }>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/confluence-links` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Checks if a ticket's Jira data is stale (lazy: only when key is provided)
export function useConflictCheck(ticketKey: string | null) {
  return useSWR<{ stale: boolean; localUpdated: string | null; remoteUpdated: string; key: string }>(
    ticketKey ? `/api/jira/check-updated?key=${encodeURIComponent(ticketKey)}` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Fetches stored reviews for a ticket, including current version hash for freshness check
export function useTicketReviews(ticketKey: string | null) {
  const swr = useSWR<{ reviews: StoredReview[]; currentVersionHash: string | null }>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/reviews` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  const saveReview = useCallback(
    async (review: {
      source: "ticket-detail" | "chat" | "bulk-action";
      overallScore: number;
      dimensions: { key: string; label: string; score: number; feedback: string }[];
      summary: string;
      suggestions: string[];
    }) => {
      if (!ticketKey) return null;
      const saved = await ticketsApi.createReview(ticketKey, review) as StoredReview;
      // Revalidate reviews list and ticket detail (qualityScore updated on server)
      swr.mutate();
      globalMutate(ticketsApi.detailUrl(ticketKey));
      return saved;
    },
    [ticketKey, swr],
  );

  const deleteReview = useCallback(
    async (reviewId: string) => {
      if (!ticketKey) return false;
      await ticketsApi.deleteReview(ticketKey, reviewId);
      swr.mutate();
      globalMutate(ticketsApi.detailUrl(ticketKey));
      return true;
    },
    [ticketKey, swr],
  );

  return { ...swr, saveReview, deleteReview };
}

// Fetches Bitbucket development info (branches, PRs, commits, builds) for a ticket
export function useDevInfo(ticketKey: string | null) {
  return useSWR<DevInfoPayload>(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/dev-info` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

export interface ActiveSession {
  sessionId: string;
  ticketKey: string;
  title: string;
  sprintName: string | null;
  status: string;
  updatedAt: string | null;
}

// Fetches active story writer sessions with enriched ticket info
export function useActiveWriterSessions() {
  return useSWR<ActiveSession[]>(
    "/api/story-writer/active-sessions",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

