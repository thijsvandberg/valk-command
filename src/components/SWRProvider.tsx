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
      }}
    >
      {children}
    </SWRConfig>
  );
}

export { fetcher };
