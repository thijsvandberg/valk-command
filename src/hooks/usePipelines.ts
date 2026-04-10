import useSWR, { mutate as globalMutate } from "swr";
import { useCallback, useRef, useEffect } from "react";
import type { PipelineRunPayload } from "@/app/api/pipelines/route";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

interface PipelineResponse {
  runs: PipelineRunPayload[];
  hasRunning: boolean;
}

const IDLE_INTERVAL = 5 * 60 * 1000;
const ACTIVE_INTERVAL = 30 * 1000;

export function usePipelines(filters?: {
  repo?: string;
  ticketKey?: string;
  sprintTickets?: string[];
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.repo) params.set("repo", filters.repo);
  if (filters?.ticketKey) params.set("ticketKey", filters.ticketKey);
  if (filters?.sprintTickets?.length) params.set("sprintTickets", filters.sprintTickets.join(","));
  if (filters?.limit) params.set("limit", String(filters.limit));

  const key = `/api/pipelines${params.toString() ? `?${params}` : ""}`;

  const swr = useSWR<PipelineResponse>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
    refreshInterval: IDLE_INTERVAL,
  });

  // Adaptive polling: speed up when pipelines are running
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const interval = swr.data?.hasRunning ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    intervalRef.current = setInterval(() => {
      swr.mutate();
    }, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [swr.data?.hasRunning, swr.mutate, swr]);

  const refresh = useCallback(() => {
    return fetch("/api/pipelines", { method: "POST" }).then(() => {
      swr.mutate();
    });
  }, [swr]);

  return {
    ...swr,
    runs: swr.data?.runs ?? [],
    hasRunning: swr.data?.hasRunning ?? false,
    refresh,
  };
}

export function useFollowedTickets() {
  return useSWR<string[]>("/api/followed-tickets", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

export function useFollowTicket() {
  const follow = useCallback(async (ticketKey: string) => {
    await fetch("/api/followed-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketKey }),
    });
    globalMutate("/api/followed-tickets");
  }, []);

  const unfollow = useCallback(async (ticketKey: string) => {
    await fetch(`/api/followed-tickets?ticketKey=${encodeURIComponent(ticketKey)}`, {
      method: "DELETE",
    });
    globalMutate("/api/followed-tickets");
  }, []);

  return { follow, unfollow };
}

interface NotificationResponse {
  notifications: Array<{
    id: string;
    type: string;
    jiraKey: string | null;
    message: string;
    createdAt: string;
    read: boolean;
    category: string | null;
    linkUrl: string | null;
  }>;
  unreadCount: number;
}

export function useNotifications(limit = 50) {
  const swr = useSWR<NotificationResponse>(
    `/api/notifications?limit=${limit}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 15000,
      refreshInterval: 30000,
    },
  );

  const markRead = useCallback(async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    swr.mutate();
  }, [swr]);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    swr.mutate();
  }, [swr]);

  return {
    ...swr,
    notifications: swr.data?.notifications ?? [],
    unreadCount: swr.data?.unreadCount ?? 0,
    markRead,
    markAllRead,
  };
}
