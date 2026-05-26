"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Check, Search, Zap, X, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import useSWR from "swr";
import { apiFetch, swrFetcher, workspaceTasks, ApiError } from "@/lib/api-client";

export interface EpicOption {
  key: string;
  name: string;
}

interface EpicListItem {
  key: string;
  name: string;
  status: string;
  childCount: number;
  summary: string | null;
  summaryStale: boolean;
}

interface EpicSuggestionItem {
  key: string;
  name: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "rgba(74, 170, 96, 0.15)", text: "#4aaa60", label: "High" },
  medium: { bg: "rgba(234, 179, 8, 0.12)", text: "#eab308", label: "Med" },
  low:    { bg: "rgba(155, 108, 212, 0.10)", text: "#9b6cd4", label: "Low" },
};

export function EpicPicker({
  value,
  onChange,
  align = "right",
  ticketKey,
}: {
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  align?: "left" | "right";
  ticketKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flipUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // AI suggestion state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<EpicSuggestionItem[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Always fetch so data is ready when picker opens
  const { data: epics, mutate } = useSWR<EpicListItem[]>(
    "/api/epics",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
  const hasSyncedRef = useRef(false);

  const filtered = useMemo(() => {
    if (!epics) return [];
    if (!query.trim()) return epics;
    const q = query.toLowerCase();
    return epics.filter(
      (e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q),
    );
  }, [epics, query]);

  // Stale summary count for the refresh indicator
  const staleCount = useMemo(() => {
    if (!epics) return 0;
    return epics.filter((e) => e.summaryStale).length;
  }, [epics]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const flipUp = rect.bottom + 300 > window.innerHeight;
    const popoverWidth = 280;
    let left: number;
    if (align === "left") {
      left = rect.left;
      if (left + popoverWidth > window.innerWidth - 8) {
        left = window.innerWidth - popoverWidth - 8;
      }
    } else {
      left = rect.right;
    }
    setPos({
      top: flipUp ? rect.top : rect.bottom + 4,
      left,
      flipUp,
    });
  }, [align]);

  const handleOpen = useCallback(() => {
    updatePosition();
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [updatePosition]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/jira/sync-epics", { method: "POST" });
      await mutate();
    } catch {
      // Sync failure is non-critical
    } finally {
      setSyncing(false);
    }
  }, [mutate]);

  // Auto-sync from Jira once per session on first open
  useEffect(() => {
    if (!open || hasSyncedRef.current || syncing) return;
    hasSyncedRef.current = true;
    handleSync();
  }, [open, syncing, handleSync]);

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

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Dismiss suggestions when user types
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value.trim()) {
      setSuggestions(null);
      setSuggestError(null);
    }
  }, []);

  const handleSuggestEpic = useCallback(async () => {
    if (!ticketKey || suggesting) return;

    setSuggesting(true);
    setSuggestions(null);
    setSuggestError(null);
    eventSourceRef.current?.close();

    try {
      const resp = await apiFetch<{ taskId: string; streamUrl: string }>(
        `/api/tickets/${ticketKey}/suggest-epic`,
        { method: "POST" },
      );
      if (!resp.taskId) {
        setSuggestError("No task ID returned");
        setSuggesting(false);
        return;
      }

      const es = new EventSource(workspaceTasks.streamUrl(resp.taskId));
      eventSourceRef.current = es;
      let resolved = false;

      es.addEventListener("result", (e) => {
        if (resolved) return;
        resolved = true;
        try {
          const data = JSON.parse((e as MessageEvent).data);
          const output = (data.output ?? data.text ?? "") as string;
          const match = output.match(/<json-output>([\s\S]*?)<\/json-output>/);
          if (match) {
            const parsed = JSON.parse(match[1].trim()) as EpicSuggestionItem[];
            setSuggestions(parsed.filter((s) => s.key && s.name));
          }
        } catch {
          setSuggestError("Failed to parse suggestions");
        }
        es.close();
        eventSourceRef.current = null;
        setSuggesting(false);
      });

      es.addEventListener("error", () => {
        if (resolved) return;
        resolved = true;
        es.close();
        eventSourceRef.current = null;
        setSuggestError("Connection to workspace lost");
        setSuggesting(false);
      });

      // Timeout after 90s
      setTimeout(() => {
        if (!resolved && eventSourceRef.current === es) {
          resolved = true;
          es.close();
          eventSourceRef.current = null;
          setSuggesting(false);
          setSuggestError("Suggestion timed out");
        }
      }, 90_000);
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.body?.error ?? `Request failed (${err.status})`
        : "Failed to request suggestion";
      setSuggestError(msg);
      setSuggesting(false);
    }
  }, [ticketKey, suggesting]);

  const handleGenerateSummaries = useCallback(async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/epics/generate-summaries", { method: "POST" });
    } catch {
      // Non-critical
    } finally {
      setSyncing(false);
    }
  }, []);

  // Suggestion keys for highlighting in the list
  const suggestedKeys = useMemo(() => {
    if (!suggestions) return new Set<string>();
    return new Set(suggestions.map((s) => s.key));
  }, [suggestions]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? handleClose() : handleOpen()}
        title={value ? `Epic: ${value.name}` : "Select epic"}
        className="inline-flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium cursor-pointer hover:bg-overlay-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
      >
        <Zap size={12} strokeWidth={1.5} className={`shrink-0 ${value ? "text-[#9b6cd4]" : "text-text-muted"}`} />
        <span className={`truncate max-w-[140px] ${value ? "text-[#9b6cd4] font-medium" : "text-text-muted"}`}>
          {value ? value.name : "Select epic"}
        </span>
      </button>

      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] w-[280px] rounded-xl border border-border-default"
          style={{
            top: pos.flipUp ? undefined : pos.top,
            bottom: pos.flipUp ? window.innerHeight - pos.top + 4 : undefined,
            left: align === "left" ? pos.left : undefined,
            right: align === "right" ? Math.max(8, window.innerWidth - pos.left) : undefined,
            backgroundColor: "var(--color-surface-floating)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.20), 0 1px 4px rgba(0,0,0,0.10)",
          }}
        >
          {/* Search + actions */}
          <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2">
            <Search size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={handleSearchChange}
              placeholder="Search epics..."
              className="flex-1 bg-transparent text-xs text-text-secondary placeholder:text-text-muted focus:outline-none"
            />
            {ticketKey && (
              <button
                type="button"
                onClick={handleSuggestEpic}
                disabled={suggesting}
                title="Suggest epic with AI"
                className="shrink-0 rounded p-0.5 text-[#9b6cd4] cursor-pointer hover:text-[#b48ee6] hover:bg-[rgba(155,108,212,0.08)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40"
                style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
              >
                <Sparkles
                  size={11}
                  strokeWidth={1.5}
                  className={suggesting ? "animate-pulse" : ""}
                />
              </button>
            )}
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              title="Sync epics from Jira"
              className="shrink-0 rounded p-0.5 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40"
              style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
            >
              <RefreshCw
                size={11}
                strokeWidth={1.5}
                className={syncing ? "animate-spin" : ""}
              />
            </button>
          </div>

          {/* AI suggestion loading */}
          {suggesting && (
            <div className="border-b border-border-subtle px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div
                  className="h-1 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: "rgba(155, 108, 212, 0.12)" }}
                >
                  <div
                    className="h-full rounded-full animate-pulse"
                    style={{
                      width: "60%",
                      backgroundColor: "rgba(155, 108, 212, 0.4)",
                      animation: "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    }}
                  />
                </div>
                <span className="text-caption text-[#9b6cd4]">Analyzing...</span>
              </div>
            </div>
          )}

          {/* AI suggestion error */}
          {suggestError && !suggesting && (
            <div className="border-b border-border-subtle px-3 py-2">
              <p className="text-caption text-[#e5534b]">{suggestError}</p>
            </div>
          )}

          {/* AI suggestions section */}
          {suggestions && suggestions.length > 0 && !query.trim() && (
            <div
              className="border-b border-border-subtle py-1"
              style={{ backgroundColor: "rgba(155, 108, 212, 0.04)" }}
            >
              <div className="px-3 pt-1 pb-0.5">
                <span className="text-caption font-medium uppercase tracking-wider text-[#9b6cd4]/60">
                  AI Suggestions
                </span>
              </div>
              {suggestions.map((s) => {
                const conf = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;
                const isSelected = s.key === value?.key;
                return (
                  <button
                    key={`suggest-${s.key}`}
                    type="button"
                    onClick={() => { onChange({ key: s.key, name: s.name }); handleClose(); }}
                    className="flex w-full items-start gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-[rgba(155,108,212,0.08)] active:bg-[rgba(155,108,212,0.12)]"
                  >
                    <span className="flex w-4 items-center justify-center shrink-0 mt-0.5 text-[#9b6cd4]">
                      <Sparkles size={10} strokeWidth={1.5} />
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className={`truncate ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                          {s.name}
                        </span>
                        <span
                          className="shrink-0 rounded px-1 py-px text-caption font-medium"
                          style={{ backgroundColor: conf.bg, color: conf.text }}
                        >
                          {conf.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-caption text-text-muted leading-snug truncate">
                        {s.reason}
                      </p>
                    </div>
                    {isSelected && <Check size={11} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[var(--color-brand-400)]" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Options */}
          <div className="max-h-[280px] overflow-y-auto py-1">
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

            {!epics && (
              <p className="px-3 py-2 text-xs text-text-muted">Loading...</p>
            )}

            {epics && filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-text-muted">
                {query.trim() ? "No epics found" : "No epics available"}
              </p>
            )}

            {filtered.map((epic) => {
              const isSelected = epic.key === value?.key;
              const isSuggested = suggestedKeys.has(epic.key);
              return (
                <button
                  key={epic.key}
                  type="button"
                  onClick={() => { onChange({ key: epic.key, name: epic.name }); handleClose(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
                  style={isSuggested && !query.trim() ? { backgroundColor: "rgba(155, 108, 212, 0.04)" } : undefined}
                >
                  <span className="flex w-4 items-center justify-center shrink-0 text-[#9b6cd4]">
                    <Zap size={11} strokeWidth={1.5} />
                  </span>
                  <span className={`flex-1 text-left truncate ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                    {epic.name}
                  </span>
                  {epic.summaryStale && (
                    <span title="Summary outdated" className="shrink-0 flex items-center">
                      <AlertTriangle size={9} strokeWidth={1.5} className="text-[#ea8744]/50" />
                    </span>
                  )}
                  <span className="shrink-0 text-caption text-text-muted">{epic.key}</span>
                  {isSelected && <Check size={11} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />}
                </button>
              );
            })}
          </div>

          {/* Stale summaries footer */}
          {staleCount > 0 && !query.trim() && (
            <div className="border-t border-border-subtle px-3 py-1.5 flex items-center justify-between">
              <span className="text-caption text-text-muted">
                {staleCount} stale {staleCount === 1 ? "summary" : "summaries"}
              </span>
              <button
                type="button"
                onClick={handleGenerateSummaries}
                disabled={syncing}
                className="text-caption text-[#9b6cd4] cursor-pointer hover:text-[#b48ee6] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40"
                style={{ transition: "color 0.15s ease" }}
              >
                Refresh
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
