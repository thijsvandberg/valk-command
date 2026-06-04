"use client";

import { SWRConfig } from "swr";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 30000,
        // Keep the previously loaded data visible while a new key fetches, so
        // switching between tickets/sprints swaps content in place instead of
        // flashing a loading state. Background revalidation still keeps it fresh.
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}

export { fetcher };
