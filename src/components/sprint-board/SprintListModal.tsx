"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { X, Pin, Check, RefreshCw } from "lucide-react";

type SyncResult = { count: number; timestamp: number } | null;

type Tab = "current" | "history";

interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function dateRange(sprint: JiraSprint): string {
  const start = formatDate(sprint.startDate);
  const end = formatDate(sprint.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  return "";
}

function stateColor(state: string): string {
  if (state === "active") return "#4aaa60";
  if (state === "future") return "#60a5fa";
  return "rgba(255,255,255,0.2)";
}

function stateLabel(state: string): string {
  if (state === "active") return "Active";
  if (state === "future") return "Future";
  return "Closed";
}

export function SprintListModal({
  onClose,
  onSelect,
  onPin,
  pinnedIds,
}: {
  onClose: () => void;
  onSelect: (sprintId: string, sprintName: string) => void;
  onPin: (sprintId: string) => void;
  pinnedIds: Set<string>;
}) {
  const [tab, setTab] = useState<Tab>("current");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { data: sprints, mutate } = useJiraSprints();

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const [res] = await Promise.all([
        fetch("/api/jira/sync-sprints", { method: "POST" }),
        // Minimum visible duration so the user sees the loading state
        new Promise((r) => setTimeout(r, 600)),
      ]);
      if (!res.ok) console.error("Sprint sync failed:", res.status);
      const data = await res.json().catch(() => null);
      await mutate();
      setSyncResult({ count: data?.count ?? 0, timestamp: Date.now() });
    } finally {
      setSyncing(false);
    }
  }, [mutate]);

  // Auto-clear sync result after 8 seconds
  useEffect(() => {
    if (!syncResult) return;
    const t = setTimeout(() => setSyncResult(null), 8000);
    return () => clearTimeout(t);
  }, [syncResult]);

  const allSprints = sprints ?? [];
  const currentAndUpcoming = allSprints.filter(
    (s) => s.state === "active" || s.state === "future",
  );
  const history = allSprints.filter((s) => s.state === "closed");

  const list = tab === "current" ? currentAndUpcoming : history;
  const filtered = search
    ? list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : list;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]"
      style={{ animation: "sprintListIn 0.15s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 pt-3 pb-0">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setTab("current")}
            className={`relative rounded-t-md px-3 py-2 text-xs font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              tab === "current"
                ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-[var(--color-brand-400)]"
                : "text-white/35 hover:text-white/55 active:text-white/65"
            }`}
          >
            Current & Upcoming
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`relative rounded-t-md px-3 py-2 text-xs font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              tab === "history"
                ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-[var(--color-brand-400)]"
                : "text-white/35 hover:text-white/55 active:text-white/65"
            }`}
          >
            History
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mb-1 flex h-6 w-6 items-center justify-center rounded-md text-white/25 cursor-pointer hover:bg-white/[0.06] hover:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.08]"
        >
          <X className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sprints..."
          autoFocus
          className="w-full rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder:text-white/25 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
        />
      </div>

      {/* Sprint list */}
      <div className="max-h-72 overflow-y-auto px-1.5 py-1.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-white/25">
            {allSprints.length === 0
              ? "No sprints cached. Sync from Jira to load."
              : "No sprints match your search."}
          </div>
        ) : (
          filtered.map((sprint) => (
            <button
              type="button"
              key={sprint.id}
              onClick={() => {
                onSelect(String(sprint.id), sprint.name);
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/65 cursor-pointer hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.07]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: stateColor(sprint.state) }}
                />
                <span className="truncate">{sprint.name}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-white/15">#{sprint.id}</span>
              </span>
              <span className="ml-2 flex shrink-0 items-center gap-1">
                <span className="text-xs text-white/20">
                  {dateRange(sprint) || stateLabel(sprint.state)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin(String(sprint.id));
                  }}
                  className={`flex h-5 w-5 items-center justify-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    pinnedIds.has(String(sprint.id))
                      ? "text-[var(--color-brand-400)]"
                      : "text-white/15 hover:text-white/40 hover:bg-white/[0.04]"
                  }`}
                  title={pinnedIds.has(String(sprint.id)) ? "Pinned to tab" : "Pin to tab"}
                >
                  <Pin
                    className="h-3 w-3"
                    strokeWidth={1.5}
                    fill={pinnedIds.has(String(sprint.id)) ? "currentColor" : "none"}
                  />
                </button>
              </span>
            </button>
          ))
        )}
      </div>

      {/* Sync button */}
      <div className="border-t border-white/[0.06] px-3 py-2.5">
        <button
          type="button"
          disabled={syncing}
          onClick={handleSync}
          className={`flex w-full items-center justify-center gap-2 rounded-md border py-1.5 text-xs font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed ${
            syncResult
              ? "border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
              : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:text-white/70 active:bg-white/[0.07] disabled:opacity-40"
          }`}
        >
          {syncResult ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              Synced {syncResult.count} sprint{syncResult.count === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
              {syncing ? "Syncing from Jira..." : "Sync from Jira"}
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes sprintListIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
