// `preload` is safe as a top-level import: SWR keys its PRELOAD map off the
// default cache's global state on both the write and read side, so it works
// under the custom provider. The top-level `mutate` is NOT (silent no-op against
// provider-backed keys, BRDG-458) — cache seeding goes through scopedMutate.
import { preload } from "swr";
import { fetcher } from "@/components/SWRProvider";
import { scopedMutate } from "@/lib/swr-scoped-mutate";
import type { Ticket } from "@/types/ticket";

const MAX_CONCURRENT = 3;
let activePrefetches = 0;
const activeControllers = new Map<string, AbortController>();

function isSlowConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const type = conn.effectiveType;
  return type === "2g" || type === "slow-2g";
}

export function prefetchUrl(url: string): void {
  if (isSlowConnection()) return;
  if (activePrefetches >= MAX_CONCURRENT) return;

  const controller = new AbortController();
  activeControllers.set(url, controller);

  activePrefetches++;
  preload(url, fetcher);
  setTimeout(() => {
    activePrefetches = Math.max(0, activePrefetches - 1);
    activeControllers.delete(url);
  }, 500);
}

export function cancelAllPrefetches(): void {
  activeControllers.forEach((c) => c.abort());
  activeControllers.clear();
  activePrefetches = 0;
}

export function prefetchTicketDetail(key: string): void {
  prefetchUrl(`/api/tickets/${encodeURIComponent(key)}`);
}

// Prefetch the Next.js page chunk for a ticket so the JS bundle is ready on navigation
let routerPrefetchFn: ((url: string) => void) | null = null;
export function setRouterPrefetch(fn: (url: string) => void): void {
  routerPrefetchFn = fn;
}

export function prefetchTicketPage(key: string): void {
  prefetchTicketDetail(key);
  routerPrefetchFn?.(`/tickets/${key}`);
}

export function prefetchTicketList(sprintId: string): void {
  prefetchUrl(`/api/tickets?sprintId=${encodeURIComponent(sprintId)}`);
}

export function prefetchConversation(id: string): void {
  prefetchUrl(`/api/conversations/${encodeURIComponent(id)}`);
}

// Pre-seed the SWR detail cache with list-level ticket data so the detail page
// can render instantly with partial data while the full API call completes.
// Uses `revalidate: true` so SWR immediately fires the real fetch in the background.
export function seedTicketDetailCache(ticket: Ticket): void {
  const detailKey = `/api/tickets/${encodeURIComponent(ticket.key)}`;
  void scopedMutate(detailKey, ticket, { revalidate: true });
}
