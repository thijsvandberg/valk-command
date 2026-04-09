"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { X, Pin, Check, RefreshCw, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/shared/TextInput";

type Tab = "sprints" | "history" | "hidden";

interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  hidden?: boolean;
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

function sortSprints(list: JiraSprint[], tab: Tab): JiraSprint[] {
  if (tab === "history") {
    return [...list].sort((a, b) => {
      const aDate = a.endDate ? new Date(a.endDate).getTime() : 0;
      const bDate = b.endDate ? new Date(b.endDate).getTime() : 0;
      return bDate - aDate;
    });
  }
  return [...list].sort((a, b) => {
    if (a.state === "active" && b.state !== "active") return -1;
    if (a.state !== "active" && b.state === "active") return 1;
    if (a.state === "active" && b.state === "active") {
      const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aDate - bDate;
    }
    return a.name.localeCompare(b.name);
  });
}

export function SprintListModal({
  onClose,
  onSelect,
  onPin,
  pinnedIds,
  alignLeft,
}: {
  onClose: () => void;
  onSelect: (sprintId: string, sprintName: string) => void;
  onPin: (sprintId: string) => void;
  pinnedIds: Set<string>;
  alignLeft?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("sprints");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { data: sprints, mutate } = useJiraSprints();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncCount(null);
    setSyncError(null);
    const scope = tab === "history" ? "history" : "sprints";
    try {
      const [res] = await Promise.all([
        fetch(`/api/jira/sync-sprints?scope=${scope}`, { method: "POST" }),
        new Promise((r) => setTimeout(r, 600)),
      ]);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSyncError(data?.error || `Sync failed (${res.status})`);
      } else {
        await mutate();
        setSyncCount(data?.count ?? 0);
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSyncing(false);
    }
  }, [mutate, tab]);

  useEffect(() => {
    if (syncCount === null && !syncError) return;
    const t = setTimeout(() => { setSyncCount(null); setSyncError(null); }, 8000);
    return () => clearTimeout(t);
  }, [syncCount, syncError]);

  const handleToggleHidden = useCallback(async (sprintId: number, currentlyHidden: boolean) => {
    const allSprints = sprints ?? [];
    const currentHiddenIds = allSprints.filter((s) => s.hidden).map((s) => s.id);

    let newHiddenIds: number[];
    if (currentlyHidden) {
      newHiddenIds = currentHiddenIds.filter((id) => id !== sprintId);
    } else {
      newHiddenIds = [...currentHiddenIds, sprintId];
      if (pinnedIds.has(String(sprintId))) {
        onPin(String(sprintId));
      }
    }

    await fetch("/api/jira/sprints", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenIds: newHiddenIds }),
    });
    await mutate();
  }, [sprints, pinnedIds, onPin, mutate]);

  const allSprints = sprints ?? [];
  const visibleActive = allSprints.filter(
    (s) => !s.hidden && (s.state === "active" || s.state === "future"),
  );
  const visibleHistory = allSprints.filter((s) => !s.hidden && s.state === "closed");
  const hiddenSprints = allSprints.filter((s) => s.hidden);

  const listMap: Record<Tab, JiraSprint[]> = {
    sprints: visibleActive,
    history: visibleHistory,
    hidden: hiddenSprints,
  };

  const sorted = sortSprints(listMap[tab], tab);
  const filtered = search
    ? sorted.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const syncLabel = tab === "history" ? "Sync history" : "Sync sprints";
  const showSync = tab !== "hidden";

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "sprints", label: "Sprints" },
    { key: "history", label: "History" },
    { key: "hidden", label: "Hidden", count: hiddenSprints.length },
  ];

  return (
    <div
      ref={ref}
      className={`absolute top-full z-50 mt-1.5 w-80 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)] ${alignLeft ? "left-0" : "right-0"}`}
      style={{ animation: "sprintListIn 0.15s ease-out" }}
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 pt-3 pb-0">
        <div className="flex items-center gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative rounded-t-md px-3 py-2 text-xs font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                tab === t.key
                  ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-[var(--color-brand-400)]"
                  : "text-white/35 hover:text-white/55 active:text-white/65"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="ml-1 text-[10px] text-white/20">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<X className="h-3 w-3" strokeWidth={1.5} />}
          onClick={onClose}
          className="mb-1 text-white/25"
        />
      </div>

      <div className="px-3 pt-3 pb-1">
        <TextInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sprints..."
          autoFocus
        />
      </div>

      <div className="max-h-72 overflow-y-auto px-1.5 py-1.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-white/25">
            {allSprints.length === 0
              ? "No sprints cached. Sync from Jira to load."
              : tab === "hidden"
                ? "No hidden sprints."
                : "No sprints match your search."}
          </div>
        ) : (
          filtered.map((sprint) => {
            const isPinned = pinnedIds.has(String(sprint.id));
            const isHidden = sprint.hidden ?? false;
            return (
              <div
                key={sprint.id}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/65 cursor-pointer hover:bg-white/[0.05] hover:text-white"
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelect(String(sprint.id), sprint.name);
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(String(sprint.id), sprint.name);
                    onClose();
                  }
                }}
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
                      handleToggleHidden(sprint.id, isHidden);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded cursor-pointer text-white/15 hover:text-white/40 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    title={isHidden ? "Restore sprint" : "Hide sprint"}
                  >
                    {isHidden ? (
                      <EyeOff className="h-3 w-3" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-3 w-3" strokeWidth={1.5} />
                    )}
                  </button>
                  {tab !== "hidden" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPin(String(sprint.id));
                      }}
                      className={`flex h-5 w-5 items-center justify-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                        isPinned
                          ? "text-[var(--color-brand-400)]"
                          : "text-white/15 hover:text-white/40 hover:bg-white/[0.04]"
                      }`}
                      title={isPinned ? "Unpin from tabs" : "Pin to tab"}
                    >
                      <Pin
                        className="h-3 w-3"
                        strokeWidth={1.5}
                        fill={isPinned ? "currentColor" : "none"}
                      />
                    </button>
                  )}
                </span>
              </div>
            );
          }))
        }
      </div>

      {showSync && (
        <div className="border-t border-white/[0.06] px-3 py-2.5">
          {syncError && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
              <span className="min-w-0">
                {syncError}
                <button
                  type="button"
                  onClick={handleSync}
                  className="ml-1.5 text-red-300 underline underline-offset-2 cursor-pointer hover:text-red-200"
                >
                  Retry
                </button>
              </span>
            </div>
          )}
          <Button
            variant={syncCount !== null ? "soft" : "ghost"}
            size="md"
            disabled={syncing}
            onClick={handleSync}
            icon={syncCount !== null
              ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              : <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} strokeWidth={1.5} />
            }
            className="w-full"
          >
            {syncCount !== null
              ? `Synced ${syncCount} sprint${syncCount === 1 ? "" : "s"}`
              : syncing ? "Syncing..." : syncLabel}
          </Button>
        </div>
      )}

      <style>{`
        @keyframes sprintListIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
