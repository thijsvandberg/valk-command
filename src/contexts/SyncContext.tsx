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
import type { SyncLogEntry } from "@/types/ticket";

export type SyncState = "idle" | "syncing" | "error";

export interface Toast {
  id: string;
  entry: SyncLogEntry;
}

interface SyncContextValue {
  syncState: SyncState;
  lastSync: SyncLogEntry | null;
  unacknowledgedErrors: SyncLogEntry[];
  logEntries: SyncLogEntry[];
  jiraOnline: boolean;
  toasts: Toast[];
  runningEntries: SyncLogEntry[];
  triggerSync: (type: "sprint" | "tickets" | "comments", scope?: string) => Promise<void>;
  cancelSync: (id: string) => Promise<void>;
  cancelAllSyncs: () => Promise<void>;
  acknowledgeError: (id: string) => Promise<void>;
  dismissToast: (id: string) => void;
  retryHealth: () => void;
  mutateSyncLog: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSyncContext must be used within SyncProvider");
  return ctx;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : []));

const SYNC_ENDPOINTS: Record<string, string> = {
  sprint: "/api/jira/sync-sprints",
  tickets: "/api/jira/sync-tickets",
  comments: "/api/jira/sync-comments",
};

export function SyncProvider({ children }: { children: ReactNode }) {
  const [toastEntries, setToastEntries] = useState<Toast[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());

  const { data: logEntries, mutate: mutateSyncLog } = useSWR<SyncLogEntry[]>(
    "/api/sync-log?limit=20",
    fetcher,
    {
      refreshInterval: 10000,
      revalidateOnFocus: true,
      onSuccess: (data) => {
        if (!initialized) {
          // First load: mark all existing IDs as known, don't toast them
          setKnownIds(new Set(data.map((e) => e.id)));
          setInitialized(true);
          return;
        }
        // Subsequent loads: toast new completed entries
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

  // Active toasts: not yet dismissed
  const toasts = useMemo(
    () => toastEntries.filter((t) => !dismissedIds.has(t.id)),
    [toastEntries, dismissedIds],
  );

  // Auto-dismiss success toasts after 3s
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

  const syncState: SyncState = (() => {
    if (entries.length === 0) return "idle";
    const hasRunning = entries.some((e) => e.status === "running");
    if (hasRunning) return "syncing";
    const hasUnackedError = entries.some(
      (e) => e.status === "failed" && !e.acknowledged,
    );
    if (hasUnackedError) return "error";
    return "idle";
  })();

  const lastSync = entries[0] ?? null;

  const unacknowledgedErrors = entries.filter(
    (e) => e.status === "failed" && !e.acknowledged,
  );

  const runningEntries = entries.filter((e) => e.status === "running");

  const jiraOnline = health?.ok !== false;

  const triggerSync = useCallback(
    async (type: "sprint" | "tickets" | "comments", scope?: string) => {
      const endpoint = SYNC_ENDPOINTS[type];
      const params = scope ? `?sprintId=${encodeURIComponent(scope)}` : "";
      await fetch(`${endpoint}${params}`, { method: "POST" });
      mutateSyncLog();
    },
    [mutateSyncLog],
  );

  const cancelSync = useCallback(
    async (id: string) => {
      await fetch(`/api/sync-log/${id}/cancel`, { method: "POST" });
      mutateSyncLog();
    },
    [mutateSyncLog],
  );

  const cancelAllSyncs = useCallback(
    async () => {
      await fetch("/api/sync-log/cancel-all", { method: "POST" });
      mutateSyncLog();
    },
    [mutateSyncLog],
  );

  const acknowledgeError = useCallback(
    async (id: string) => {
      await fetch(`/api/sync-log/${id}/acknowledge`, { method: "POST" });
      mutateSyncLog();
      setDismissedIds((prev) => new Set([...prev, id]));
    },
    [mutateSyncLog],
  );

  const dismissToast = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const retryHealth = useCallback(() => {
    mutateHealth();
  }, [mutateHealth]);

  return (
    <SyncContext.Provider
      value={{
        syncState,
        lastSync,
        unacknowledgedErrors,
        runningEntries,
        logEntries: entries,
        jiraOnline,
        toasts,
        triggerSync,
        cancelSync,
        cancelAllSyncs,
        acknowledgeError,
        dismissToast,
        retryHealth,
        mutateSyncLog,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
