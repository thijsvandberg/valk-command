"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, X, Search } from "lucide-react";

export interface FilterDropdownProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  renderOption?: (value: string) => React.ReactNode;
  /** Show a search input to filter options */
  searchable?: boolean;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** Map option values to display labels (used for search matching and display) */
  labelMap?: Record<string, string>;
  /** Dropdown width class, default "w-60" */
  widthClass?: string;
  /** Align dropdown: "left" (default) or "right" */
  align?: "left" | "right";
}

export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  renderOption,
  searchable = false,
  searchPlaceholder = "Search...",
  labelMap,
  widthClass = "w-60",
  align = "left",
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    if (open && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (!next) setSearch("");
  }

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((opt) => {
      const display = labelMap?.[opt] ?? opt;
      return display.toLowerCase().includes(q);
    });
  }, [options, search, searchable, labelMap]);

  const isActive = selected.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] ${
          isActive
            ? "border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)]"
            : "border-white/[0.07] bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/75 hover:border-white/[0.12]"
        }`}
        style={{ transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms" }}
      >
        {label}
        {isActive && (
          <span
            className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-0.5 text-[10px] font-semibold"
            style={{ backgroundColor: "var(--color-brand-500)", color: "#fff" }}
          >
            {selected.size}
          </span>
        )}
        <ChevronDown
          className={`h-3 w-3 shrink-0 opacity-40 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          style={{ transition: "transform 150ms" }}
        />
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 ${widthClass} rounded-xl border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_12px_40px_rgba(0,0,0,0.55),0_4px_12px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.04)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {/* Search + clear header */}
          {searchable && (
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-white/20" strokeWidth={1.5} />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-white/80 placeholder:text-white/25 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/25 cursor-pointer hover:text-white/50"
                >
                  <X className="h-2.5 w-2.5" strokeWidth={2} />
                </button>
              )}
            </div>
          )}

          {/* Clear filter (only visible when something is selected) */}
          {isActive && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="flex w-full items-center gap-2 border-b border-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/30 cursor-pointer hover:bg-white/[0.03] hover:text-white/50"
              style={{ transition: "background-color 80ms, color 80ms" }}
            >
              <X className="h-2.5 w-2.5" strokeWidth={2} />
              Clear filter
            </button>
          )}

          {/* Options list */}
          <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {filteredOptions.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-white/20">
                No matches
              </div>
            )}
            {filteredOptions.map((opt) => {
              const checked = selected.has(opt);
              return (
                <label
                  key={opt}
                  className={`flex w-full items-center gap-2.5 px-3 py-[7px] text-[13px] cursor-pointer hover:bg-white/[0.04] ${
                    checked ? "text-white/80" : "text-white/55 hover:text-white/75"
                  }`}
                  style={{ transition: "background-color 80ms, color 80ms" }}
                >
                  <span
                    className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border"
                    style={{
                      backgroundColor: checked ? "var(--color-brand-500)" : "transparent",
                      borderColor: checked ? "var(--color-brand-500)" : "rgba(255,255,255,0.15)",
                      transition: "background-color 100ms, border-color 100ms",
                    }}
                  >
                    {checked && (
                      <svg width="8" height="6" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(opt);
                      else next.delete(opt);
                      onChange(next);
                    }}
                    className="sr-only"
                  />
                  {renderOption ? renderOption(opt) : <span>{labelMap?.[opt] ?? opt}</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
