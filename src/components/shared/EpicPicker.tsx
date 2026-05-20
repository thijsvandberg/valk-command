"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Check, Search, ChevronDown, Zap, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

export interface EpicOption {
  key: string;
  name: string;
}

interface JiraSearchResponse {
  issues: Array<{
    key: string;
    summary: string;
    status: string;
  }>;
}

export function EpicPicker({
  value,
  onChange,
  align = "right",
}: {
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EpicOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const flipUp = rect.bottom + 300 > window.innerHeight;
    setPos({
      top: flipUp ? rect.top : rect.bottom + 4,
      left: align === "left" ? rect.left : rect.right,
      flipUp,
    });
  }, [align]);

  const fetchEpics = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({ issuetype: "Epic" });
      if (q.trim()) params.set("q", q.trim());
      const data = await apiFetch<JiraSearchResponse>(
        `/api/search/jira?${params.toString()}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setResults(data.issues.map((i) => ({ key: i.key, name: i.summary })));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!controller.signal.aborted) setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const handleOpen = useCallback(() => {
    updatePosition();
    setOpen(true);
    setQuery("");
    setResults([]);
    fetchEpics("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [updatePosition, fetchEpics]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    abortRef.current?.abort();
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchEpics(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, fetchEpics]);

  // Click outside, escape, scroll handlers
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      handleClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    function handleScroll() { updatePosition(); }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePosition, handleClose]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? handleClose() : handleOpen()}
        title={value ? `Epic: ${value.name}` : "No epic"}
        className="group/epic inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
        style={{ transition: "background-color 0.15s ease" }}
      >
        {value ? (
          <>
            <Zap size={10} strokeWidth={2} className="shrink-0 text-[#9b6cd4]" />
            <span className="truncate max-w-[140px] font-medium text-[#9b6cd4]">{value.name}</span>
          </>
        ) : (
          <span className="text-text-muted">None</span>
        )}
        <ChevronDown
          size={10}
          strokeWidth={2}
          className="shrink-0 text-text-muted opacity-0 group-hover/epic:opacity-100"
          style={{ transition: "opacity 0.15s ease" }}
        />
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-[260px] rounded-xl border border-border-default"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: align === "left" ? pos.left : undefined,
            right: align === "right" ? window.innerWidth - pos.left : undefined,
            backgroundColor: "var(--color-surface-floating)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.20), 0 1px 4px rgba(0,0,0,0.10)",
          }}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
            <Search size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search epics..."
              className="flex-1 bg-transparent text-xs text-text-secondary placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {/* Options */}
          <div className="max-h-[220px] overflow-y-auto py-1">
            {/* Remove epic option */}
            {!query.trim() && value && (
              <button
                type="button"
                onClick={() => { onChange(null); handleClose(); }}
                className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
              >
                <span className="flex w-4 items-center justify-center shrink-0 text-text-muted">
                  <X size={11} strokeWidth={1.5} />
                </span>
                <span className="text-text-secondary">Remove epic</span>
              </button>
            )}

            {loading && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-text-muted">Loading...</p>
            )}

            {!loading && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-text-muted">
                {query.trim() ? "No epics found" : "No epics available"}
              </p>
            )}

            {results.map((epic) => {
              const isSelected = epic.key === value?.key;
              return (
                <button
                  key={epic.key}
                  type="button"
                  onClick={() => { onChange(epic); handleClose(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
                >
                  <span className="flex w-4 items-center justify-center shrink-0 text-[#9b6cd4]">
                    <Zap size={11} strokeWidth={1.5} />
                  </span>
                  <span className={`flex-1 text-left truncate ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                    {epic.name}
                  </span>
                  <span className="shrink-0 text-caption text-text-muted">{epic.key}</span>
                  {isSelected && <Check size={11} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
