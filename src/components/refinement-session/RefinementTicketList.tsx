"use client";

import { useState, useRef, useEffect } from "react";
import { Search, SlidersHorizontal, X, Settings2, Check } from "lucide-react";
import { TicketRow } from "./TicketRow";
import { RefinementFilters } from "./RefinementFilters";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import type { useRefinementFilters } from "@/hooks/useRefinementFilters";
import type { useRefinementQueue } from "@/hooks/useRefinementQueue";
import type { Ticket } from "@/types/ticket";

const PILL_FIELDS = [
  { id: "issueType", label: "Type icon" },
  { id: "key", label: "Ticket key" },
  { id: "status", label: "Status badge" },
];

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
  const { visible: pillFields, toggleField: togglePillField } = useSectionVisibility("refinement-pill", ["issueType", "key", "status"]);
  const [pillSettingsOpen, setPillSettingsOpen] = useState(false);
  const pillSettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pillSettingsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (pillSettingsRef.current && !pillSettingsRef.current.contains(e.target as Node)) {
        setPillSettingsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPillSettingsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pillSettingsOpen]);

  const showIssueType = pillFields.has("issueType");
  const showKey = pillFields.has("key");
  const showStatus = pillFields.has("status");

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-4 flex min-h-7 items-center gap-3">
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
        <div className="relative" ref={pillSettingsRef}>
          <button
            type="button"
            onClick={() => setPillSettingsOpen((v) => !v)}
            className={`flex cursor-pointer items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
              pillSettingsOpen ? "text-[var(--color-brand-400)]" : "text-text-muted hover:text-text-secondary"
            }`}
            style={{ transition: "color 0.12s ease" }}
            title="Pill display settings"
          >
            <Settings2 size={15} strokeWidth={1.5} />
          </button>
          {pillSettingsOpen && (
            <div
              className="absolute top-full right-0 z-50 mt-1 min-w-[160px] rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
              style={{ animation: "fadeInUp 0.1s ease" }}
            >
              <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-text-muted">
                Pill display
              </div>
              {PILL_FIELDS.map((field) => {
                const isVisible = pillFields.has(field.id);
                return (
                  <button
                    key={field.id}
                    type="button"
                    onClick={() => togglePillField(field.id, !isVisible)}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-body-sm hover:bg-hover-list-item active:bg-overlay-default"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        isVisible
                          ? "border-[var(--color-brand-400)] bg-[var(--color-brand-400)]"
                          : "border-border-default bg-transparent"
                      }`}
                      style={{ transition: "background-color 0.1s ease, border-color 0.1s ease" }}
                    >
                      {isVisible && <Check size={10} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="text-text-secondary">{field.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
            showIssueType={showIssueType}
            showKey={showKey}
            showStatus={showStatus}
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
