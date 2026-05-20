import { preload } from "swr";
import { fetcher } from "@/components/SWRProvider";

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
