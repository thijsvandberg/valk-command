"use client";

import { useState, useRef, useEffect } from "react";
import type { Sprint } from "@/types/ticket";
import { ChevronRight } from "lucide-react";

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

  const activeFuture = sprints.filter((s) => s.state !== "closed");
  const closed = sprints.filter((s) => s.state === "closed");
  const filtered = (list: Sprint[]) =>
    search ? list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : list;

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-lg border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      <div className="p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sprints..."
          autoFocus
          className="w-full rounded-md border border-border-default bg-white/[0.03] px-3 py-1.5 text-sm text-white placeholder:text-white/25 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto px-1 pb-1">
        {filtered(activeFuture).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onSelect(s.id);
              onClose();
            }}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/70 cursor-pointer hover:bg-hover-list-item hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
          >
            <span className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.state === "active" ? "#4aaa60" : "#60a5fa" }}
              />
              {s.name}
            </span>
            <span className="text-xs text-white/25">{s.dateRange || `${s.ticketCount} items`}</span>
          </button>
        ))}

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
              filtered(closed).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelect(s.id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-white/40 cursor-pointer hover:bg-hover-list-item hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.06]"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    {s.name}
                  </span>
                  <span className="text-xs text-white/20">{s.dateRange}</span>
                </button>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
