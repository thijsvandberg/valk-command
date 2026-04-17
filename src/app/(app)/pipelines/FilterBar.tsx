"use client";

import { useState } from "react";
import { Filter, ChevronDown, Calendar, User, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { StatusFilterValue, DateRangeValue } from "./pipeline-helpers";

// -- Status Filter --

export function StatusFilter({
  selected,
  onSelect,
}: {
  selected: StatusFilterValue;
  onSelect: (v: StatusFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);

  const options: { value: StatusFilterValue; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "failed", label: "Failed only" },
    { value: "successful", label: "Passed only" },
    { value: "running", label: "Running only" },
    { value: "deployments", label: "Deployments only" },
  ];

  const current = options.find((o) => o.value === selected) ?? options[0];

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Filter size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected !== "all" ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {current.label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[170px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                  selected === opt.value ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -- Date Range Filter --

export function DateRangeFilter({
  selected,
  onSelect,
}: {
  selected: DateRangeValue;
  onSelect: (v: DateRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);

  const options: { value: DateRangeValue; label: string }[] = [
    { value: "all", label: "All time" },
    { value: "today", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ];

  const current = options.find((o) => o.value === selected) ?? options[0];

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Calendar size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected !== "all" ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {current.label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[150px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                  selected === opt.value ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -- Creator Filter (multi-select with search) --

export function CreatorFilter({
  creators,
  selected,
  onToggle,
  onClear,
}: {
  creators: string[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (creators.length === 0) return null;

  const filtered = search
    ? creators.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : creators;

  const label = selected.length === 0
    ? "Creator"
    : selected.length === 1
    ? selected[0]
    : `${selected.length} creators`;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<User size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected.length > 0 ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Search */}
            <div className="px-2 py-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04]">
                <Search size={11} strokeWidth={1.5} className="text-white/20 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search creators..."
                  autoFocus
                  className="flex-1 bg-transparent text-body-sm text-white/60 placeholder:text-white/20 outline-none"
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[260px] py-1">
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => { onClear(); }}
                  className="w-full px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 text-white/40 hover:bg-white/[0.04]"
                >
                  Clear selection
                </button>
              )}
              {filtered.map((name) => {
                const isChecked = selected.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onToggle(name)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                      isChecked ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className={`flex items-center justify-center h-3.5 w-3.5 rounded border text-caption shrink-0 ${
                      isChecked ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]" : "border-white/15"
                    }`}>
                      {isChecked && "\u2713"}
                    </span>
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// -- Repo Filter --

export function RepoFilter({
  repos,
  selected,
  onSelect,
}: {
  repos: string[];
  selected: string | null;
  onSelect: (repo: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (repos.length <= 1) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Filter size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {selected || "All repos"}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] py-1">
            <button
              type="button"
              onClick={() => { onSelect(null); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                !selected ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              All repos
            </button>
            {repos.map((repo) => (
              <button
                key={repo}
                type="button"
                onClick={() => { onSelect(repo); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                  selected === repo ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : "text-white/50 hover:bg-white/[0.04]"
                }`}
              >
                {repo}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -- Sprint Filter (multi-select with search) --

export function SprintFilter({
  sprints,
  selected,
  onToggle,
  onClear,
}: {
  sprints: { id: number; name: string; state: string; hidden?: boolean }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSet = new Set(selected);

  const visibleSprints = sprints
    .filter((s) => !("hidden" in s && s.hidden))
    .filter((s) => s.state === "active" || s.state === "future" || s.state === "closed")
    .slice(0, 20);

  // Always include selected sprints even if not in the visible list
  const selectedNotVisible = sprints.filter((s) => selectedSet.has(String(s.id)) && !visibleSprints.some((v) => v.id === s.id));

  if (visibleSprints.length === 0 && selectedNotVisible.length === 0) return null;

  const current = visibleSprints.filter((s) => s.state === "active" || s.state === "future");
  const closed = visibleSprints.filter((s) => s.state === "closed");

  const filtered = (list: typeof visibleSprints) =>
    search ? list.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())) : list;

  // Resolve label from all sprints (not just visible)
  const label = selected.length === 0
    ? "Sprint"
    : selected.length === 1
    ? sprints.find((s) => String(s.id) === selected[0])?.name ?? "1 sprint"
    : `${selected.length} sprints`;

  function renderItem(s: { id: number; name: string; state: string }, dimmed?: boolean) {
    const id = String(s.id);
    const isChecked = selected.includes(id);
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onToggle(id)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
          isChecked ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10" : dimmed ? "text-white/35 hover:bg-white/[0.04]" : "text-white/50 hover:bg-white/[0.04]"
        }`}
      >
        <span className={`flex items-center justify-center h-3.5 w-3.5 rounded border text-caption shrink-0 ${
          isChecked ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]" : "border-white/15"
        }`}>
          {isChecked && "\u2713"}
        </span>
        {s.name}
      </button>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        icon={<Filter size={12} strokeWidth={1.5} />}
        onClick={() => setOpen(!open)}
        className={selected.length > 0 ? "border-[var(--color-brand-500)]/30 text-[var(--color-brand-400)]" : ""}
      >
        {label}
        <ChevronDown size={11} strokeWidth={1.5} className="ml-0.5 text-white/20" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Search */}
            <div className="px-2 py-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04]">
                <Search size={11} strokeWidth={1.5} className="text-white/20 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search sprints..."
                  autoFocus
                  className="flex-1 bg-transparent text-body-sm text-white/60 placeholder:text-white/20 outline-none"
                />
              </div>
            </div>

            <div className="overflow-y-auto max-h-[300px] py-1">
              {/* Clear button */}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => { onClear(); }}
                  className="w-full px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 text-white/40 hover:bg-white/[0.04]"
                >
                  Clear selection
                </button>
              )}

              {/* Selected sprints not in the standard list */}
              {filtered(selectedNotVisible).map((s) => renderItem(s))}
              {filtered(selectedNotVisible).length > 0 && (filtered(current).length > 0 || filtered(closed).length > 0) && (
                <div className="mx-3 my-1 border-t border-white/[0.06]" />
              )}

              {/* Active / future */}
              {filtered(current).map((s) => renderItem(s))}

              {/* Closed */}
              {filtered(closed).length > 0 && (
                <>
                  <div className="mx-3 my-1 border-t border-white/[0.06]" />
                  <span className="block px-3 py-1 text-caption font-medium text-white/20 uppercase tracking-wider">Recent</span>
                  {filtered(closed).map((s) => renderItem(s, true))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
