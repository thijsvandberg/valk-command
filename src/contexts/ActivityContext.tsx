"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { useJiraHealth } from "@/hooks/useSprintBoard";
import { useIncrementalSync } from "@/hooks/useIncrementalSync";
import type { ActivityLogEntry } from "@/types/ticket";

export type ActivityState = "idle" | "syncing" | "error";

export interface Toast {
  id: string;
  entry: ActivityLogEntry;
}

interface ActivityContextValue {
  activityState: ActivityState;
  lastEntry: ActivityLogEntry | null;
  unacknowledgedErrors: ActivityLogEntry[];
  logEntries: ActivityLogEntry[];
  jiraOnline: boolean;
  toasts: Toast[];
  runningEntries: ActivityLogEntry[];
  incrementalSyncRemaining: number;
  incrementalSyncLastAt: string | null;
  incrementalSyncLastCount: number;
  triggerSync: (type: "sprint" | "tickets" | "comments", scope?: string) => Promise<void>;
  cancelEntry: (id: string) => Promise<void>;
  cancelAllEntries: () => Promise<void>;
  acknowledgeError: (id: string) => Promise<void>;
  dismissToast: (id: string) => void;
  retryHealth: () => void;
  mutateActivityLog: () => void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function useActivityContext() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivityContext must be used within ActivityProvider");
  return ctx;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

const SYNC_ENDPOINTS: Record<string, string> = {
  sprint: "/api/jira/sync-sprints",
  tickets: "/api/jira/sync-tickets",
  comments: "/api/jira/sync-comments",
};

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [toastEntries, setToastEntries] = useState<Toast[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());

  const { data: logEntries, mutate: mutateActivityLog } = useSWR<ActivityLogEntry[]>(
    "/api/activity-log?limit=20",
    fetcher,
    {
      // Poll faster when jobs are running, slower when idle
      refreshInterval: (data) => {
        const hasRunning = data?.some((e) => e.status === "running");
        return hasRunning ? 5000 : 30000;
      },
      revalidateOnFocus: true,
      onSuccess: (data) => {
        if (!initialized) {
          setKnownIds(new Set(data.map((e) => e.id)));
          setInitialized(true);
          return;
        }
        const newToasts: Toast[] = [];
        setKnownIds((prev) => {
          const next = new Set(prev);
          for (const entry of data) {
            if (entry.status === "running") continue;
            if (next.has(entry.id)) continue;
            next.add(entry.id);
            newToasts.push({ id: entry.id, entry });
          }
          return next;
        });
        if (newToasts.length > 0) {
          setToastEntries((prev) => [...prev, ...newToasts]);
        }
      },
    },
  );

  const { data: health, mutate: mutateHealth } = useJiraHealth();

  const {
    remaining: incrementalSyncRemaining,
    lastSyncAt: incrementalSyncLastAt,
    lastSyncCount: incrementalSyncLastCount,
  } = useIncrementalSync(mutateActivityLog);

  const toasts = useMemo(
    () => toastEntries.filter((t) => !dismissedIds.has(t.id)),
    [toastEntries, dismissedIds],
  );

  useEffect(() => {
    const successToasts = toasts.filter((t) => t.entry.status === "success");
    if (successToasts.length === 0) return;

    const timers = successToasts.map((t) =>
      setTimeout(() => {
        setDismissedIds((prev) => new Set([...prev, t.id]));
      }, 3000),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  const entries = logEntries ?? [];

  const activityState: ActivityState = (() => {
    if (entries.length === 0) return "idle";
    const hasRunning = entries.some((e) => e.status === "running");
    if (hasRunning) return "syncing";
    const hasUnackedError = entries.some(
      (e) => e.status === "failed" && !e.acknowledged,
    );
    if (hasUnackedError) return "error";
    return "idle";
  })();

  const lastEntry = entries[0] ?? null;

  const unacknowledgedErrors = entries.filter(
    (e) => e.status === "failed" && !e.acknowledged,
  );

  const runningEntries = entries.filter((e) => e.status === "running");

  const jiraOnline = health?.ok !== false;

  const triggerSync = useCallback(
    async (type: "sprint" | "tickets" | "comments", scope?: string) => {
      const endpoint = SYNC_ENDPOINTS[type];
      const params = scope ? `?sprintId=${encodeURIComponent(scope)}` : "";
      const res = await fetch(`${endpoint}${params}`, { method: "POST" });
      mutateActivityLog();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Sync failed (${res.status})`);
      }
    },
    [mutateActivityLog],
  );

  const cancelEntry = useCallback(
    async (id: string) => {
      await fetch(`/api/activity-log/${id}/cancel`, { method: "POST" });
      mutateActivityLog();
    },
    [mutateActivityLog],
  );

  const cancelAllEntries = useCallback(
    async () => {
      await fetch("/api/activity-log/cancel-all", { method: "POST" });
      mutateActivityLog();
    },
    [mutateActivityLog],
  );

  const acknowledgeError = useCallback(
    async (id: string) => {
      await fetch(`/api/activity-log/${id}/acknowledge`, { method: "POST" });
      mutateActivityLog();
      setDismissedIds((prev) => new Set([...prev, id]));
    },
    [mutateActivityLog],
  );

  const dismissToast = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const retryHealth = useCallback(() => {
    mutateHealth();
  }, [mutateHealth]);

  return (
    <ActivityContext.Provider
      value={{
        activityState,
        lastEntry,
        unacknowledgedErrors,
        runningEntries,
        incrementalSyncRemaining,
        incrementalSyncLastAt,
        incrementalSyncLastCount,
        logEntries: entries,
        jiraOnline,
        toasts,
        triggerSync,
        cancelEntry,
        cancelAllEntries,
        acknowledgeError,
        dismissToast,
        retryHealth,
        mutateActivityLog,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
}
