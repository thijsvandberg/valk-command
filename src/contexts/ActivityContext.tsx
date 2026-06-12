"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { swrFetcher, apiFetch, activityLog } from "@/lib/api-client";
import { useJiraHealth } from "@/hooks/useSprintBoard";
import { useSchedulerTick } from "@/hooks/useSchedulerTick";
import { usePipelineTick } from "@/hooks/usePipelineTick";
import type { ActivityLogEntry } from "@/types/ticket";

export type ActivityState = "idle" | "syncing" | "error";

export interface Toast {
  id: string;
  entry: ActivityLogEntry;
}

// Split into two contexts to prevent toast changes from re-rendering
// components that only read activity status (and vice versa).

interface ActivityStatusContextValue {
  activityState: ActivityState;
  lastEntry: ActivityLogEntry | null;
  unacknowledgedErrors: ActivityLogEntry[];
  logEntries: ActivityLogEntry[];
  jiraOnline: boolean;
  runningEntries: ActivityLogEntry[];
  incrementalSyncRemaining: number;
  incrementalSyncLastAt: string | null;
  incrementalSyncLastCount: number;
  triggerSync: (type: "sprint" | "tickets" | "comments", scope?: string) => Promise<void>;
  cancelEntry: (id: string) => Promise<void>;
  cancelAllEntries: () => Promise<void>;
  acknowledgeError: (id: string) => Promise<void>;
  acknowledgeAllErrors: () => Promise<void>;
  retryEntry: (id: string) => Promise<void>;
  retryHealth: () => void;
  mutateActivityLog: () => void;
}

interface ActivityToastContextValue {
  toasts: Toast[];
  dismissToast: (id: string) => void;
}

const ActivityStatusCtx = createContext<ActivityStatusContextValue | null>(null);
const ActivityToastCtx = createContext<ActivityToastContextValue | null>(null);

export function useActivityStatus() {
  const ctx = useContext(ActivityStatusCtx);
  if (!ctx) throw new Error("useActivityStatus must be used within ActivityProvider");
  return ctx;
}

export function useActivityToasts() {
  const ctx = useContext(ActivityToastCtx);
  if (!ctx) throw new Error("useActivityToasts must be used within ActivityProvider");
  return ctx;
}

// Backward-compatible combined hook
export function useActivityContext() {
  return { ...useActivityStatus(), ...useActivityToasts() };
}

const fetcher = (url: string) => swrFetcher<ActivityLogEntry[]>(url).catch(() => [] as ActivityLogEntry[]);

const SYNC_ENDPOINTS: Record<string, string> = {
  sprint: "/api/jira/sync-sprints",
  tickets: "/api/jira/sync-tickets",
  comments: "/api/jira/sync-comments",
};

const RETRY_SYNC_MAP: Record<string, string> = {
  "sprint-sync": "sprint",
  "ticket-sync": "tickets",
  "comment-sync": "comments",
  "incremental-sync": "tickets",
};

// Decides which newly observed activity-log entries surface as toasts and
// marks them as seen by mutating knownIds, so each entry is evaluated exactly
// once across polls. Most entries come from background syncs (scheduler,
// hover prefetch, auto-fetch on ticket open), so routine completions stay
// silent and only failures demand attention. Success confirmations for
// explicit user actions (e.g. retry) are pushed locally by their call sites.
// Running entries are left unmarked so their final status is evaluated later.
export function collectNewToasts(entries: ActivityLogEntry[], knownIds: Set<string>): Toast[] {
  const newToasts: Toast[] = [];
  for (const entry of entries) {
    if (entry.status === "running") continue;
    if (knownIds.has(entry.id)) continue;
    knownIds.add(entry.id);
    if (entry.status === "failed") {
      newToasts.push({ id: entry.id, entry });
    }
  }
  return newToasts;
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [toastEntries, setToastEntries] = useState<Toast[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // A ref (not state) so the seen-set can be updated inside the SWR callback
  // without a side-effectful state updater, which StrictMode double-invokes
  // in dev and which produced duplicate toasts. null until the first poll
  // establishes the baseline; baseline entries never toast.
  const knownIdsRef = useRef<Set<string> | null>(null);

  const { data: logEntries, mutate: mutateActivityLog } = useSWR<ActivityLogEntry[]>(
    "/api/activity-log?limit=20",
    fetcher,
    {
      refreshInterval: (data) => {
        const hasRunning = data?.some((e) => e.status === "running");
        return hasRunning ? 5000 : 30000;
      },
      revalidateOnFocus: true,
      onSuccess: (data) => {
        if (!knownIdsRef.current) {
          knownIdsRef.current = new Set(
            data.filter((e) => e.status !== "running").map((e) => e.id),
          );
          return;
        }
        const newToasts = collectNewToasts(data, knownIdsRef.current);
        if (newToasts.length > 0) {
          setToastEntries((prev) => [...prev, ...newToasts].slice(-50));
        }
      },
    },
  );

  const { data: health, mutate: mutateHealth } = useJiraHealth();

  const {
    remaining: incrementalSyncRemaining,
    lastSyncAt: incrementalSyncLastAt,
    lastSyncCount: incrementalSyncLastCount,
  } = useSchedulerTick(mutateActivityLog);

  usePipelineTick();

  const toasts = useMemo(
    () => toastEntries.filter((t) => !dismissedIds.has(t.id)),
    [toastEntries, dismissedIds],
  );

  const timedToastIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newSuccessToasts = toasts.filter(
      (t) => t.entry.status === "success" && !timedToastIds.current.has(t.id),
    );
    for (const t of newSuccessToasts) {
      timedToastIds.current.add(t.id);
      setTimeout(() => {
        setDismissedIds((prev) => new Set([...prev, t.id]));
        timedToastIds.current.delete(t.id);
      }, 3000);
    }
  }, [toasts]);

  const entries = useMemo(() => logEntries ?? [], [logEntries]);

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

  const unacknowledgedErrors = useMemo(
    () => entries.filter((e) => e.status === "failed" && !e.acknowledged),
    [entries],
  );

  const runningEntries = useMemo(
    () => entries.filter((e) => e.status === "running"),
    [entries],
  );

  const jiraOnline = health?.ok !== false;

  const triggerSync = useCallback(
    async (type: "sprint" | "tickets" | "comments", scope?: string) => {
      const endpoint = SYNC_ENDPOINTS[type];
      const params = scope ? `?sprintId=${encodeURIComponent(scope)}` : "";
      await apiFetch(`${endpoint}${params}`, { method: "POST" });
      mutateActivityLog();
    },
    [mutateActivityLog],
  );

  const cancelEntry = useCallback(
    async (id: string) => {
      await activityLog.cancel(id);
      mutateActivityLog();
    },
    [mutateActivityLog],
  );

  const cancelAllEntries = useCallback(
    async () => {
      await activityLog.cancelAll();
      mutateActivityLog();
    },
    [mutateActivityLog],
  );

  const acknowledgeError = useCallback(
    async (id: string) => {
      await activityLog.acknowledge(id);
      mutateActivityLog();
      setDismissedIds((prev) => new Set([...prev, id]));
    },
    [mutateActivityLog],
  );

  const acknowledgeAllErrors = useCallback(
    async () => {
      await activityLog.acknowledgeAll();
      mutateActivityLog();
    },
    [mutateActivityLog],
  );

  const retryEntry = useCallback(
    async (id: string) => {
      const entry = entries.find((e) => e.id === id);
      if (!entry) return;
      const syncType = RETRY_SYNC_MAP[entry.type];
      if (!syncType) return;
      setDismissedIds((prev) => new Set([...prev, id]));
      try {
        await triggerSync(syncType as "sprint" | "tickets" | "comments", entry.scope ?? undefined);
      } catch {
        // The failed run writes its own activity entry, which toasts via the poll.
        return;
      }
      // Retry is an explicit user action, so confirm success directly; the
      // poll stays silent for successful runs.
      const now = new Date().toISOString();
      setToastEntries((prev) => [
        ...prev,
        {
          id: `retry-${id}-${Date.now()}`,
          entry: {
            ...entry,
            status: "success" as const,
            summary: "Retry succeeded",
            errorDetail: null,
            completedAt: now,
          },
        },
      ].slice(-50));
    },
    [entries, triggerSync],
  );

  const dismissToast = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const retryHealth = useCallback(() => {
    mutateHealth();
  }, [mutateHealth]);

  // Memoized context values to prevent unnecessary re-renders
  const statusValue = useMemo<ActivityStatusContextValue>(() => ({
    activityState,
    lastEntry,
    unacknowledgedErrors,
    runningEntries,
    incrementalSyncRemaining,
    incrementalSyncLastAt,
    incrementalSyncLastCount,
    logEntries: entries,
    jiraOnline,
    triggerSync,
    cancelEntry,
    cancelAllEntries,
    acknowledgeError,
    acknowledgeAllErrors,
    retryEntry,
    retryHealth,
    mutateActivityLog,
  }), [activityState, lastEntry, unacknowledgedErrors, runningEntries, incrementalSyncRemaining, incrementalSyncLastAt, incrementalSyncLastCount, entries, jiraOnline, triggerSync, cancelEntry, cancelAllEntries, acknowledgeError, acknowledgeAllErrors, retryEntry, retryHealth, mutateActivityLog]);

  const toastValue = useMemo<ActivityToastContextValue>(() => ({
    toasts,
    dismissToast,
  }), [toasts, dismissToast]);

  return (
    <ActivityStatusCtx.Provider value={statusValue}>
      <ActivityToastCtx.Provider value={toastValue}>
        {children}
      </ActivityToastCtx.Provider>
    </ActivityStatusCtx.Provider>
  );
}
