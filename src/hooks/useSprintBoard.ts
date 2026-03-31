import useSWR from "swr";
import { useRef, useMemo, useEffect } from "react";

// Generic JSON fetcher for SWR
const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

// Fetches saved sprint slot configuration with SWR caching
export function useSprintSlots() {
  return useSWR<{ slotIndex: number; sprintId: string; sprintName: string }[] | null>(
    "/api/sprint-slots",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches cached sprint list from the DB
export function useJiraSprints() {
  return useSWR<{ id: number; name: string; state: string; startDate: string | null; endDate: string | null }[]>(
    "/api/jira/sprints",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );
}

// Fetches ticket versions for the side panel (lazy: only when ticketKey is provided)
export function useTicketVersions(ticketKey: string | null) {
  return useSWR(
    ticketKey ? `/api/tickets/${encodeURIComponent(ticketKey)}/versions` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

// Debounce hook: returns a stable function that delays invoking callback
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useMemo(
    () =>
      (...args: A) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
      },
    [delay],
  );
}
