"use client";

import { useState, useEffect } from "react";
import type { JiraStatus } from "@/types/ticket";
import { tickets as ticketsApi, ApiError } from "@/lib/api-client";

interface TicketExistsResult {
  exists: boolean | null;
  status: JiraStatus | null;
  loading: boolean;
}

// Module-level cache shared across all hook instances
const ticketCache = new Map<string, { exists: boolean; status: JiraStatus | null }>();

function getInitialState(key: string | null): TicketExistsResult {
  if (!key) return { exists: null, status: null, loading: false };
  const cached = ticketCache.get(key);
  if (cached) return { ...cached, loading: false };
  return { exists: null, status: null, loading: true };
}

export function useTicketExists(key: string | null): TicketExistsResult {
  const [result, setResult] = useState<TicketExistsResult>(() => getInitialState(key));

  useEffect(() => {
    // Skip if no key or already in cache (initial state handled it)
    if (!key || ticketCache.has(key)) return;

    let cancelled = false;

    ticketsApi.get(key)
      .then((data) => {
        if (cancelled) return;
        const entry = { exists: true, status: (data.jiraStatus ?? null) as JiraStatus | null };
        ticketCache.set(key, entry);
        setResult({ ...entry, loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        const entry = { exists: false, status: null };
        ticketCache.set(key, entry);
        setResult({ ...entry, loading: false });
      });

    return () => { cancelled = true; };
  }, [key]);

  return result;
}
