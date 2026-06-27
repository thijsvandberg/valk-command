"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { Avatar } from "@/components/shared/Avatar";
import { WatcherPicker } from "@/components/shared/WatcherPicker";
import type { AssignableUser } from "@/components/shared/AssigneePicker";
import { swrFetcher, jira } from "@/lib/api-client";
import { userInitials, userColor } from "@/lib/user-display";
import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/ui/Toast";
import type { Assignee } from "@/types/ticket";

const MAX_VISIBLE = 3;

interface WatchersResponse {
  watchers: AssignableUser[];
}

/**
 * Watchers control shared by the ticket single view and the Story Writer meta
 * pane. Watchers are not persisted locally (BRDG-264): they are fetched on
 * demand and written straight through to Jira. Add/remove are optimistic with
 * rollback + a toast on failure, mirroring the assignee change pattern.
 */
export function WatchersRow({ ticketKey, align = "right" }: { ticketKey: string; align?: "left" | "right" }) {
  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const { data, mutate } = useSWR<WatchersResponse>(
    ticketKey ? jira.watchersUrl(ticketKey) : null,
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const watchers = data?.watchers ?? [];

  const handleAdd = useCallback(async (user: AssignableUser) => {
    if (!user.accountId) return; // watchers always carry a real Jira id
    const prev = data?.watchers ?? [];
    if (prev.some((w) => w.accountId === user.accountId)) return;
    const next = [...prev, user];
    mutate({ watchers: next }, false);
    try {
      await jira.addWatcher({ issueKey: ticketKey, accountId: user.accountId });
      mutate();
    } catch {
      mutate({ watchers: prev }, false);
      showToast("Couldn't add watcher");
    }
  }, [data, mutate, ticketKey, showToast]);

  const handleRemove = useCallback(async (user: AssignableUser) => {
    if (!user.accountId) return; // watchers always carry a real Jira id
    const prev = data?.watchers ?? [];
    const next = prev.filter((w) => w.accountId !== user.accountId);
    mutate({ watchers: next }, false);
    try {
      await jira.removeWatcher({ issueKey: ticketKey, accountId: user.accountId });
      mutate();
    } catch {
      mutate({ watchers: prev }, false);
      showToast("Couldn't remove watcher");
    }
  }, [data, mutate, ticketKey, showToast]);

  const visible = watchers.slice(0, MAX_VISIBLE);
  const overflow = watchers.length - visible.length;

  return (
    <div className="inline-flex items-center gap-2">
      {watchers.length === 0 ? (
        <span className="text-text-muted">No watchers</span>
      ) : (
        <div className="flex items-center" aria-label={`${watchers.length} watcher${watchers.length === 1 ? "" : "s"}`}>
          {visible.map((w) => {
            const a: Assignee = { name: w.displayName, initials: userInitials(w.displayName), color: userColor(w.displayName) };
            return (
              <div
                key={w.accountId}
                className="rounded-full"
                style={{ marginLeft: -6, boxShadow: "0 0 0 2px var(--color-surface-elevated)" }}
              >
                <Avatar assignee={a} size={20} />
              </div>
            );
          })}
          {overflow > 0 && (
            <div
              className="flex items-center justify-center rounded-full bg-overlay-subtle text-caption font-semibold text-text-muted"
              style={{ width: 20, height: 20, marginLeft: -6, boxShadow: "0 0 0 2px var(--color-surface-elevated)" }}
              title={watchers.slice(MAX_VISIBLE).map((w) => w.displayName).join(", ")}
            >
              +{overflow}
            </div>
          )}
        </div>
      )}

      <WatcherPicker watchers={watchers} onAdd={handleAdd} onRemove={handleRemove} align={align} />

      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />
    </div>
  );
}
