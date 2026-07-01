// useSWRConfig, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for provider-backed keys (BRDG-458).
import useSWR, { useSWRConfig } from "swr";
import { useCallback, useRef, useEffect } from "react";
import type { PipelineRunPayload } from "@/app/api/pipelines/route";
import {
  swrFetcher,
  pipelines as pipelinesApi,
  followedTickets as followedTicketsApi,
  notifications as notificationsApi,
} from "@/lib/api-client";

interface SyncStatus {
  watermark: string | null;
  remaining: number;
  lastNewRuns: number;
}

interface PipelineResponse {
  runs: PipelineRunPayload[];
  hasRunning: boolean;
  syncing?: boolean;
  syncStatus?: SyncStatus;
}

const IDLE_INTERVAL = 5 * 60 * 1000;
const ACTIVE_INTERVAL = 30 * 1000;

export function usePipelines(filters?: {
  repo?: string;
  ticketKey?: string;
  sprintTickets?: string[];
  unlinked?: boolean;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.repo) params.set("repo", filters.repo);
  if (filters?.ticketKey) params.set("ticketKey", filters.ticketKey);
  if (filters?.unlinked) params.set("unlinked", "true");
  if (filters?.sprintTickets?.length) params.set("sprintTickets", filters.sprintTickets.join(","));
  if (filters?.limit) params.set("limit", String(filters.limit));

  const key = `/api/pipelines${params.toString() ? `?${params}` : ""}`;

  // The adaptive manual interval below is the SINGLE poll source. SWR's own
  // `refreshInterval` was dropped: at idle both fired, causing two refetches per
  // cycle for the same key.
  const swr = useSWR<PipelineResponse>(key, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  });

  // Adaptive polling: speed up when pipelines are running
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const swrMutate = swr.mutate;
  const hasRunning = swr.data?.hasRunning;

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const interval = hasRunning ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    intervalRef.current = setInterval(() => {
      // Skip the refetch on a hidden tab: a background dashboard need not poll.
      if (typeof document !== "undefined" && document.hidden) return;
      swrMutate();
    }, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hasRunning, swrMutate]);

  const refresh = useCallback(() => {
    return pipelinesApi.refresh().then(() => {
      swrMutate();
    });
  }, [swrMutate]);

  return {
    ...swr,
    runs: swr.data?.runs ?? [],
    hasRunning: swr.data?.hasRunning ?? false,
    syncing: swr.data?.syncing ?? false,
    syncStatus: swr.data?.syncStatus ?? null,
    refresh,
  };
}

export function useFollowedTickets() {
  return useSWR<string[]>("/api/followed-tickets", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

export function useFollowTicket() {
  const { mutate } = useSWRConfig();
  const follow = useCallback(async (ticketKey: string) => {
    await followedTicketsApi.follow(ticketKey);
    void mutate(followedTicketsApi.listUrl());
  }, [mutate]);

  const unfollow = useCallback(async (ticketKey: string) => {
    await followedTicketsApi.unfollow(ticketKey);
    void mutate(followedTicketsApi.listUrl());
  }, [mutate]);

  return { follow, unfollow };
}

export interface DeployNotificationSettings {
  enabled: boolean;
  environments: Record<string, boolean>;
}

export function useDeploySettings() {
  const swr = useSWR<DeployNotificationSettings>(
    "/api/pipelines/deploy-settings",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const update = useCallback(async (settings: DeployNotificationSettings) => {
    await pipelinesApi.updateDeploySettings(settings);
    swr.mutate();
  }, [swr]);

  return { ...swr, settings: swr.data, update };
}

export interface PipelineHealthEntry {
  status: "green" | "yellow" | "red" | "gray";
  recentFails: number;
  recentTotal: number;
  lastState: string | null;
  lastCompletedAt: string | null;
}

export function usePipelineHealth() {
  return useSWR<Record<string, PipelineHealthEntry>>(
    "/api/pipelines/health",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

export interface LastDeployedInfo {
  environment: string | null;
  completedAt: string | null;
  state: string;
}

export function useLastDeployed() {
  return useSWR<Record<string, LastDeployedInfo>>(
    "/api/pipelines/last-deployed",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
}

interface NotificationResponse {
  notifications: Array<{
    id: string;
    type: string;
    jiraKey: string | null;
    jiraTitle: string | null;
    sprintName: string | null;
    message: string;
    createdAt: string;
    eventAt: string | null;
    read: boolean;
    category: string | null;
    linkUrl: string | null;
  }>;
  unreadCount: number;
  subscribedUnreadCount: number;
  subscribedTeams: string[];
  totalCount: number;
}

export function useNotifications(limit = 50) {
  const swr = useSWR<NotificationResponse>(
    `/api/notifications?limit=${limit}`,
    swrFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 15000,
      refreshInterval: 30000,
    },
  );

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    swr.mutate();
  }, [swr]);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    swr.mutate();
  }, [swr]);

  // Deletes only read notifications (bulk clear)
  const clearRead = useCallback(async () => {
    await notificationsApi.clearRead();
    swr.mutate();
  }, [swr]);

  // Deletes a single notification by id
  const dismissOne = useCallback(async (id: string) => {
    await notificationsApi.dismiss(id);
    swr.mutate();
  }, [swr]);

  // Marks specific notifications as read (used for filtered "mark all read")
  const markFilteredRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await notificationsApi.markFilteredRead(ids);
    swr.mutate();
  }, [swr]);

  // Deletes specific read notifications (used for filtered "clear read")
  const clearFiltered = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    await notificationsApi.clearFiltered(ids);
    swr.mutate();
  }, [swr]);

  return {
    ...swr,
    notifications: swr.data?.notifications ?? [],
    unreadCount: swr.data?.unreadCount ?? 0,
    subscribedUnreadCount: swr.data?.subscribedUnreadCount ?? 0,
    subscribedTeams: swr.data?.subscribedTeams ?? [],
    totalCount: swr.data?.totalCount ?? 0,
    markRead,
    markAllRead,
    clearRead,
    dismissOne,
    markFilteredRead,
    clearFiltered,
  };
}
