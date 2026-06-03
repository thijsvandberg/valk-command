"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
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
  /** Special options shown in a distinct section above the regular list (e.g. state buckets).
   *  They share the same selection set; each gets a colored dot. Hidden while searching. */
  leadingOptions?: { value: string; label: string; dot?: string }[];
  /** Small section heading rendered above the leading options. */
  leadingLabel?: string;
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
  leadingOptions,
  leadingLabel,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useOutsideClick([triggerRef, dropdownRef], () => { setOpen(false); setSearch(""); }, { enabled: open, escapeClose: false });

  useEffect(() => {
    if (open && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]);

  function toggleOpen() {
    const next = !open;
    if (next && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos(
        align === "right"
          ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 6, left: rect.left },
      );
    }
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

  const dropdownPanel = (
    <div
      ref={dropdownRef}
      className={`fixed ${widthClass} rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]`}
      style={{
        zIndex: "var(--z-notification)",
        top: dropdownPos.top,
        left: dropdownPos.left,
        right: dropdownPos.right,
      }}
    >
      {/* Search + clear header */}
      {searchable && (
        <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); searchRef.current?.focus(); }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-muted cursor-pointer hover:text-text-secondary"
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
          className="flex w-full items-center gap-2 border-b border-border-default px-3 py-1.5 text-label font-medium text-text-tertiary cursor-pointer hover:bg-overlay-subtle hover:text-text-secondary"
          style={{ transition: "background-color 80ms, color 80ms" }}
        >
          <X className="h-2.5 w-2.5" strokeWidth={2} />
          Clear filter
        </button>
      )}

      {/* Leading section: special meta-options (e.g. sprint-state buckets) above the
          regular list, hidden while searching so name search stays focused on real items. */}
      {leadingOptions && leadingOptions.length > 0 && !search.trim() && (
        <div className="border-b border-border-default py-1">
          {leadingLabel && (
            <div className="px-3 pb-1 pt-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {leadingLabel}
            </div>
          )}
          {leadingOptions.map((opt) => {
            const checked = selected.has(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex w-full items-center gap-2.5 px-3 py-[7px] text-body cursor-pointer hover:bg-hover-list-item ${
                  checked ? "text-text-primary" : "text-text-secondary hover:text-text-secondary"
                }`}
                style={{ transition: "background-color 80ms, color 80ms" }}
              >
                <span
                  className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border"
                  style={{
                    backgroundColor: checked ? "var(--color-brand-500)" : "transparent",
                    borderColor: checked ? "var(--color-brand-500)" : "var(--color-text-muted)",
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
                    if (e.target.checked) next.add(opt.value);
                    else next.delete(opt.value);
                    onChange(next);
                  }}
                  className="sr-only"
                />
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: opt.dot ?? "var(--color-status-neutral)" }}
                />
                <span className="font-medium">{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Options list */}
      <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
        {filteredOptions.length === 0 && (
          <div className="px-3 py-4 text-center text-body-sm text-text-muted">
            No matches
          </div>
        )}
        {filteredOptions.map((opt) => {
          const checked = selected.has(opt);
          return (
            <label
              key={opt}
              className={`flex w-full items-center gap-2.5 px-3 py-[7px] text-body cursor-pointer hover:bg-hover-list-item ${
                checked ? "text-text-primary" : "text-text-secondary hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 80ms, color 80ms" }}
            >
              <span
                className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border"
                style={{
                  backgroundColor: checked ? "var(--color-brand-500)" : "transparent",
                  borderColor: checked ? "var(--color-brand-500)" : "var(--color-text-muted)",
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
  );

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className={`flex items-center gap-1 rounded-md border px-2 py-1 text-label font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] ${
          isActive
            ? "border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)]"
            : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-interactive hover:text-text-secondary hover:border-border-strong"
        }`}
        style={{ transition: "background-color 120ms, border-color 120ms, color 120ms, transform 80ms" }}
      >
        {label}
        {isActive && (
          <span
            className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-0.5 text-caption font-semibold"
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

      {open && typeof document !== "undefined" && createPortal(dropdownPanel, document.body)}
    </div>
  );
}
