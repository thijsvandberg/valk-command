"use client";

import { Search, X, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { hasActiveFilters, type SearchFilters } from "@/components/sprint-board/SearchFilterPanel";

interface SearchModalHeaderProps {
  mode: "local" | "jira";
  query: string;
  jiraQuery: string;
  setQuery: (v: string) => void;
  setJiraQuery: (v: string) => void;
  setMode: (v: "local" | "jira") => void;
  setActiveIdx: (v: number) => void;
  showFilters: boolean;
  openFilters: () => void;
  filters: SearchFilters;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function SearchModalHeader({
  mode, query, jiraQuery, setQuery, setJiraQuery, setMode, setActiveIdx,
  showFilters, openFilters, filters, onClose, inputRef,
}: SearchModalHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-border-default px-5 py-3.5">
      <Search className="h-5 w-5 shrink-0 text-text-tertiary" strokeWidth={1.5} />
      <input
        ref={inputRef}
        data-autofocus
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="search-modal-listbox"
        aria-expanded={true}
        value={mode === "local" ? query : (jiraQuery || query)}
        onChange={(e) => { if (mode === "local") setQuery(e.target.value); else setJiraQuery(e.target.value); }}
        placeholder={mode === "local" ? "Search tickets..." : "Search Jira..."}
        className="flex-1 bg-transparent text-heading-sm text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      <div className="flex items-center gap-0.5 rounded-full p-0.5" style={{ backgroundColor: "var(--color-overlay-default)" }}>
        <button type="button" onClick={() => { setMode("local"); setActiveIdx(-1); }} className="rounded-full px-3 py-1 text-body-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]" style={{ backgroundColor: mode === "local" ? "var(--color-brand-500)" : "transparent", color: mode === "local" ? "#fff" : "var(--color-text-tertiary)", transition: "background-color 100ms, color 100ms" }}>Local</button>
        <button type="button" onClick={() => { setMode("jira"); setActiveIdx(-1); }} className="rounded-full px-3 py-1 text-body-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]" style={{ backgroundColor: mode === "jira" ? "var(--color-brand-500)" : "transparent", color: mode === "jira" ? "#fff" : "var(--color-text-tertiary)", transition: "background-color 100ms, color 100ms" }}>Jira</button>
      </div>
      {mode === "local" && (
        <div className="relative">
          <button type="button" onClick={openFilters} aria-label="Toggle filters" className="flex h-8 w-8 items-center justify-center rounded-lg cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]" style={{ backgroundColor: showFilters ? "color-mix(in srgb, var(--color-status-success) 12%, transparent)" : "var(--color-overlay-subtle)", color: showFilters ? "var(--color-brand-400)" : "var(--color-text-tertiary)", transition: "background-color 120ms, color 120ms" }}>
            <ListFilter className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {hasActiveFilters(filters) && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-brand-500)" }} />}
        </div>
      )}
      <Button variant="ghost" size="md" iconOnly icon={<X className="h-4 w-4" strokeWidth={1.5} />} onClick={onClose} />
    </div>
  );
}
