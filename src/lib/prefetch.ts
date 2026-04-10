import { preload } from "swr";
import { fetcher } from "@/components/SWRProvider";

const MAX_CONCURRENT = 3;
let activePrefetches = 0;

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

  activePrefetches++;
  preload(url, fetcher);
  // Decrement after a brief delay to allow the fetch to register
  setTimeout(() => { activePrefetches = Math.max(0, activePrefetches - 1); }, 500);
}

export function prefetchTicketDetail(key: string): void {
  prefetchUrl(`/api/tickets/${encodeURIComponent(key)}`);
}

export function prefetchTicketList(sprintId: string): void {
  prefetchUrl(`/api/tickets?sprintId=${encodeURIComponent(sprintId)}`);
}
