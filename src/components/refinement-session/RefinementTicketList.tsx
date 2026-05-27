"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { TicketRow } from "./TicketRow";
import { RefinementFilters } from "./RefinementFilters";
import type { useRefinementFilters } from "@/hooks/useRefinementFilters";
import type { useRefinementQueue } from "@/hooks/useRefinementQueue";
import type { Ticket } from "@/types/ticket";

interface RefinementTicketListProps {
  availableTickets: Ticket[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: ReturnType<typeof useRefinementFilters>;
  queueHook: ReturnType<typeof useRefinementQueue>;
  pinnedSprintIds: Set<string>;
  epicOptions: string[];
  sprintNameMap: Record<string, string>;
  ticketSessionMap: Map<string, { id: string; name: string }[]>;
  resolvedSessionId: string | null;
}

export function RefinementTicketList({
  availableTickets,
  searchQuery,
  onSearchChange,
  filters,
  queueHook,
  pinnedSprintIds,
  epicOptions,
  sprintNameMap,
  ticketSessionMap,
  resolvedSessionId,
}: RefinementTicketListProps) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="shrink-0 font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">Select tickets</h2>
        {queueHook.readyCount > 0 && (
          <button
            type="button"
            onClick={queueHook.handleToggleReadyToRefine}
            className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-status-done)] active:opacity-70 ${
              queueHook.allReadySelected
                ? "bg-[var(--color-status-done)] text-white hover:bg-[#1ea34d]"
                : "bg-[var(--color-status-done-subtle)] text-[var(--color-status-done)] hover:bg-[rgba(34,197,94,0.20)]"
            }`}
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, opacity 0.1s ease" }}
            title={queueHook.allReadySelected ? "Click to deselect all ready-to-refine tickets" : "Click to select all ready-to-refine tickets"}
          >
            {queueHook.readyCount} ready to refine
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border-default bg-overlay-subtle px-3 py-2">
        <Search size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search tickets..." className="min-w-0 flex-1 bg-transparent text-body-lg text-text-primary placeholder:text-text-muted outline-none" />
        {searchQuery && (
          <button type="button" onClick={() => onSearchChange("")} className="cursor-pointer text-text-muted hover:text-text-secondary">
            <X size={13} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          onClick={() => filters.setFiltersOpen(!filters.filtersOpen)}
          className={`relative flex cursor-pointer items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
            filters.filtersOpen ? "text-[var(--color-brand-400)]" : "text-text-muted hover:text-text-secondary"
          }`}
          style={{ transition: "color 0.12s ease" }}
          title="Toggle filters"
        >
          <SlidersHorizontal size={15} strokeWidth={1.5} />
          {filters.activeFilterCount > 0 && !filters.filtersOpen && (
            <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-brand-500)] px-0.5 text-[9px] font-semibold text-white">
              {filters.activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {filters.filtersOpen && <RefinementFilters filters={filters} pinnedSprintIds={pinnedSprintIds} epicOptions={epicOptions} />}

      {/* Ticket list */}
      <div className="space-y-1">
        {availableTickets.map((ticket, idx) => (
          <TicketRow
            key={ticket.key}
            ticket={ticket}
            selected={queueHook.queue.includes(ticket.key)}
            onToggle={queueHook.toggleTicket}
            sprintName={ticket.sprintId ? (sprintNameMap[ticket.sprintId] ?? null) : null}
            index={idx}
            sessionNames={ticketSessionMap.get(ticket.key)?.filter((s) => s.id !== resolvedSessionId).map((s) => s.name)}
            isOtherSession={(ticketSessionMap.get(ticket.key)?.some((s) => s.id !== resolvedSessionId)) ?? false}
          />
        ))}
        {availableTickets.length === 0 && (
          <p className="py-8 text-center text-body-lg text-text-muted">
            {searchQuery ? <>No tickets match &ldquo;{searchQuery}&rdquo;</> : "No tickets match the current filters."}
          </p>
        )}
      </div>
    </div>
  );
}
