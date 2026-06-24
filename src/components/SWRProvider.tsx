"use client";

import { SWRConfig } from "swr";
import { TicketSyncBridge } from "@/components/TicketSyncBridge";
import { swrFetcher } from "@/lib/api-client";
import { createLruProvider } from "@/lib/swr-lru-provider";

// Bound the global SWR cache so long-lived tabs cannot grow without limit
// (BRDG-387). The default provider is an unbounded Map; this swaps in an
// access-order LRU. See docs/architecture/client-data-and-memory.md.
const lruProvider = createLruProvider();

// The default fetcher must throw on a non-ok response so SWR routes it to
// `error` (and retries) instead of silently caching null. It delegates to the
// shared swrFetcher/apiFetch so error semantics match every keyed call. The few
// consumers that intentionally tolerate failures use swrFetcher with a local
// `.catch()` of their own (e.g. ActivityContext), so they are unaffected.
const fetcher = swrFetcher;

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        provider: lruProvider,
        revalidateOnFocus: false,
        dedupingInterval: 30000,
        // Keep the previously loaded data visible while a new key fetches, so
        // switching between tickets/sprints swaps content in place instead of
        // flashing a loading state. Background revalidation still keeps it fresh.
        keepPreviousData: true,
      }}
    >
      <TicketSyncBridge />
      {children}
    </SWRConfig>
  );
}

export { fetcher };
