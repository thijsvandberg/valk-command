"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, Zap, RefreshCw, Check, Sparkles } from "lucide-react";
import useSWR from "swr";
import { apiFetch, swrFetcher, ApiError } from "@/lib/api-client";
import { useTaskStream } from "@/hooks/useTaskStream";

interface EpicListItem {
  key: string;
  name: string;
}

interface EpicSuggestionItem {
  key: string;
  name: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "var(--color-status-success-subtle)", text: "var(--color-status-success)", label: "High" },
  medium: { bg: "var(--color-status-caution-subtle)", text: "var(--color-status-caution)", label: "Med" },
  low:    { bg: "color-mix(in srgb, var(--color-icon-epic) 10%, transparent)", text: "var(--color-icon-epic)", label: "Low" },
};

/**
 * Embeddable epic picker for menu surfaces (right-click row menu, bulk-action
 * "Set Epic"). Renders the same search row + list as the sidebar EpicPicker, but
 * as plain content so it can live inside a CursorMenu/AnchoredMenu card rather
 * than owning its own popover (the right-click menu adds its own Back row).
 * Auto-syncs once on open and exposes a manual refresh, so a just-created epic
 * appears without a full reload. When `ticketKey` is supplied (a single-row
 * right-click), it also offers the AI "suggest epic" action, like the sidebar.
 */
export function EpicListPanel({
  selectedKey,
  ticketKey,
  onSelect,
  showNoEpic = true,
}: {
  selectedKey?: string | null;
  /** When set (single target), enables the AI suggest-epic action for that ticket. */
  ticketKey?: string;
  onSelect: (epicKey: string | null, epicName: string | null) => void;
  showNoEpic?: boolean;
}) {
  // Same SWR key/config as the sidebar EpicPicker, so both share one cached list.
  const { data, mutate } = useSWR<EpicListItem[]>("/api/epics", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const hasSyncedRef = useRef(false);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<EpicSuggestionItem[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestTaskId, setSuggestTaskId] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/jira/sync-epics", { method: "POST" });
      await mutate();
    } catch {
      /* non-critical: the cached list still shows */
    } finally {
      setSyncing(false);
    }
  }, [mutate]);

  // Pull newly-created epics from Jira the first time the panel opens, so the
  // list is fresh without forcing a full page refresh.
  useEffect(() => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    void sync();
  }, [sync]);

  useTaskStream(suggestTaskId, {
    timeout: 90_000,
    onResult: (taskData) => {
      try {
        const output = (taskData.output ?? taskData.text ?? "") as string;
        const match = output.match(/<json-output>([\s\S]*?)<\/json-output>/);
        if (match) {
          const parsed = JSON.parse(match[1].trim()) as EpicSuggestionItem[];
          setSuggestions(parsed.filter((s) => s.key && s.name));
        }
      } catch { setSuggestError("Failed to parse suggestions"); }
      setSuggesting(false);
    },
    onError: (message) => {
      setSuggestError(message === "Stream timed out" ? "Suggestion timed out" : message);
      setSuggesting(false);
    },
    onNetworkError: () => {
      setSuggestError("Connection to workspace lost");
      setSuggesting(false);
    },
  });

  const handleSuggest = useCallback(async () => {
    if (!ticketKey || suggesting) return;
    setSuggesting(true);
    setSuggestions(null);
    setSuggestError(null);
    setSuggestTaskId(null);
    try {
      const resp = await apiFetch<{ taskId: string; streamUrl: string }>(
        `/api/tickets/${ticketKey}/suggest-epic`,
        { method: "POST" },
      );
      if (!resp.taskId) { setSuggestError("No task ID returned"); setSuggesting(false); return; }
      setSuggestTaskId(resp.taskId);
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.body?.error ?? `Request failed (${err.status})`
        : "Failed to request suggestion";
      setSuggestError(msg);
      setSuggesting(false);
    }
  }, [ticketKey, suggesting]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    // Typing a query supersedes the suggestion view; drop stale suggestions.
    if (value.trim()) { setSuggestions(null); setSuggestError(null); }
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data;
    const q = query.toLowerCase();
    return data.filter((e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
  }, [data, query]);

  const suggestedKeys = useMemo(
    () => new Set((suggestions ?? []).map((s) => s.key)),
    [suggestions],
  );

  const showSuggestions = suggestions && suggestions.length > 0 && !query.trim();

  return (
    <div>
      {/* Search row: mirrors the sidebar EpicPicker (borderless input + inline
          AI-suggest and sync actions), so both pickers read as the same control. */}
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2">
        <Search size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search epics..."
          className="flex-1 bg-transparent text-body-sm text-text-secondary placeholder:text-text-muted focus:outline-none"
          autoFocus
        />
        {ticketKey && (
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting}
            title="Suggest epic with AI"
            aria-label="Suggest epic with AI"
            className="shrink-0 rounded p-0.5 text-[var(--color-icon-epic)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_8%,transparent)] hover:text-[#b48ee6] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40"
            style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
          >
            <Sparkles size={11} strokeWidth={1.5} className={suggesting ? "animate-pulse" : ""} />
          </button>
        )}
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          title="Sync epics from Jira"
          aria-label="Sync epics from Jira"
          className="shrink-0 rounded p-0.5 text-text-muted cursor-pointer hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40"
          style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}
        >
          <RefreshCw size={11} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* AI suggest: loading bar */}
      {suggesting && (
        <div className="border-b border-border-subtle px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 12%, transparent)" }}>
              <div className="h-full rounded-full animate-pulse" style={{ width: "60%", backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 40%, transparent)", animation: "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
            </div>
            <span className="text-caption text-[var(--color-icon-epic)]">Analyzing...</span>
          </div>
        </div>
      )}

      {/* AI suggest: error */}
      {suggestError && !suggesting && (
        <div className="border-b border-border-subtle px-3 py-2">
          <p className="text-caption text-[var(--color-status-error)]">{suggestError}</p>
        </div>
      )}

      {/* AI suggest: results */}
      {showSuggestions && (
        <div className="border-b border-border-subtle py-1" style={{ backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 4%, transparent)" }}>
          <div className="px-3 pt-1 pb-0.5">
            <span className="text-caption font-medium uppercase tracking-wider" style={{ color: "var(--color-icon-epic)", opacity: 0.6 }}>AI Suggestions</span>
          </div>
          {suggestions!.map((s) => {
            const conf = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;
            const isSelected = s.key === selectedKey;
            return (
              <button
                key={`suggest-${s.key}`}
                type="button"
                onClick={() => onSelect(s.key, s.name)}
                className="flex w-full items-start gap-2.5 px-3 py-[7px] text-body-sm cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_8%,transparent)] active:bg-[color-mix(in_srgb,var(--color-icon-epic)_12%,transparent)]"
              >
                <span className="flex w-4 items-center justify-center shrink-0 mt-0.5 text-[var(--color-icon-epic)]">
                  <Sparkles size={10} strokeWidth={1.5} />
                </span>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>{s.name}</span>
                    <span className="shrink-0 rounded px-1 py-px text-caption font-medium" style={{ backgroundColor: conf.bg, color: conf.text }}>{conf.label}</span>
                  </div>
                  <p className="mt-0.5 text-caption text-text-muted leading-snug truncate">{s.reason}</p>
                </div>
                {isSelected && <Check size={11} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[var(--color-brand-400)]" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="max-h-[280px] overflow-y-auto py-1">
        {showNoEpic && !query.trim() && (
          <button
            type="button"
            onClick={() => onSelect(null, null)}
            className="flex w-full items-center gap-2.5 px-3 py-[7px] text-body-sm text-text-tertiary cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span className="flex w-4 shrink-0" />
            <span className="flex-1 text-left">No epic</span>
          </button>
        )}

        {filtered.map((epic) => {
          const isSelected = epic.key === selectedKey;
          const isSuggested = suggestedKeys.has(epic.key);
          return (
            <button
              key={epic.key}
              type="button"
              onClick={() => onSelect(epic.key, epic.name)}
              className="flex w-full items-center gap-2.5 px-3 py-[7px] text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
              style={isSuggested && !query.trim() ? { backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 4%, transparent)" } : undefined}
            >
              <span className="flex w-4 shrink-0 items-center justify-center text-[var(--color-icon-epic)]">
                <Zap size={11} strokeWidth={1.5} />
              </span>
              <span className={`flex-1 truncate text-left ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                {epic.name}
              </span>
              <span className="shrink-0 text-caption text-text-muted">{epic.key}</span>
              {isSelected && <Check size={11} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />}
            </button>
          );
        })}

        {!data && <p className="px-3 py-2 text-body-sm text-text-muted">Loading...</p>}
        {data && filtered.length === 0 && (
          <p className="px-3 py-2 text-body-sm text-text-muted">{query.trim() ? "No epics found" : "No epics available"}</p>
        )}
      </div>
    </div>
  );
}
