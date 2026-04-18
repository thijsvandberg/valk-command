"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { Sprint } from "@/types/ticket";
import { ChevronRight } from "lucide-react";

function teamOf(name: string): string {
  const idx = name.indexOf(":");
  return idx > 0 ? name.slice(0, idx).trim() : "";
}

function sprintSecondary(s: Sprint): string {
  if (s.dateRange) return s.dateRange;
  if (s.ticketCount > 0) return `${s.ticketCount} items`;
  return "";
}

export function SprintSelector({
  sprints,
  onSelect,
  onClose,
}: {
  sprints: Sprint[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Derive unique teams from all sprints, sorted alphabetically
  const teams = useMemo(() => {
    const set = new Set<string>();
    sprints.forEach((s) => {
      const t = teamOf(s.name);
      if (t) set.add(t);
    });
    return [...set].sort();
  }, [sprints]);

  const activeFuture = sprints.filter((s) => s.state !== "closed");
  const closed = sprints.filter((s) => s.state === "closed");

  function applyFilters(list: Sprint[]) {
    let result = list;
    if (teamFilter) result = result.filter((s) => teamOf(s.name) === teamFilter);
    if (search) result = result.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
    return result;
  }

  const visibleActive = applyFilters(activeFuture);
  const visibleClosed = applyFilters(closed);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      {/* Search */}
      <div className="p-2 pb-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sprints..."
          autoFocus
          className="w-full rounded-md border border-border-default bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder:text-white/25 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
        />
      </div>

      {/* Team filter chips */}
      {teams.length > 1 && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5">
          {teams.map((team) => (
            <button
              key={team}
              type="button"
              onClick={() => setTeamFilter(teamFilter === team ? null : team)}
              className={`rounded px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors duration-100 ${
                teamFilter === team
                  ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)] ring-1 ring-[var(--color-brand-500)]/30"
                  : "bg-white/[0.05] text-white/40 hover:bg-white/[0.08] hover:text-white/60"
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      )}

      {/* Sprint list */}
      <div className="max-h-64 overflow-y-auto px-1 pb-1">
        {visibleActive.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onSelect(s.id);
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/70 cursor-pointer hover:bg-hover-list-item hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.state === "active" ? "#4aaa60" : "#60a5fa" }}
              />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="ml-3 shrink-0 text-xs text-white/25">{sprintSecondary(s)}</span>
          </button>
        ))}

        {visibleActive.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-white/25">No sprints match</p>
        )}

        {closed.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowClosed(!showClosed)}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-white/30 cursor-pointer hover:text-white/50"
            >
              <ChevronRight
                className={`h-3 w-3 transition-transform duration-150 ${showClosed ? "rotate-90" : ""}`}
                strokeWidth={1.5}
              />
              Closed sprints ({closed.length})
            </button>
            {showClosed &&
              visibleClosed.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelect(s.id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/40 cursor-pointer hover:bg-hover-list-item hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="ml-3 shrink-0 text-xs text-white/20">{sprintSecondary(s)}</span>
                </button>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
