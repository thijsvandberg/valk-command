"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Check, Search, Zap, X, RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import { BasePicker } from "@/components/shared/BasePicker";
import useSWR from "swr";
import { apiFetch, swrFetcher, ApiError } from "@/lib/api-client";
import { useTaskStream } from "@/hooks/useTaskStream";

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
  high:   { bg: "var(--color-status-success-subtle)", text: "var(--color-status-success)", label: "High" },
  medium: { bg: "var(--color-status-caution-subtle)", text: "var(--color-status-caution)", label: "Med" },
  low:    { bg: "color-mix(in srgb, var(--color-icon-epic) 10%, transparent)", text: "var(--color-icon-epic)", label: "Low" },
};

export function EpicPicker({
  value,
  onChange,
  align = "right",
  ticketKey,
  onOpenChange,
}: {
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  align?: "left" | "right";
  ticketKey?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <BasePicker.Root portal={true} align={align} popoverHeight={300} onOpenChange={onOpenChange}>
      <EpicPickerInner value={value} onChange={onChange} ticketKey={ticketKey} />
    </BasePicker.Root>
  );
}

function EpicPickerInner({
  value,
  onChange,
  ticketKey,
}: {
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  ticketKey?: string;
}) {
  const { open, query, setQuery, searchRef, handleClose } = BasePicker.useContext();

  const [syncing, setSyncing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<EpicSuggestionItem[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestTaskId, setSuggestTaskId] = useState<string | null>(null);

  const { data: epics, mutate } = useSWR<EpicListItem[]>(
    "/api/epics",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );
  const hasSyncedRef = useRef(false);

  // Close stream when picker closes
  useEffect(() => {
    if (!open) setSuggestTaskId(null);
  }, [open]);

  useTaskStream(suggestTaskId, {
    timeout: 90_000,
    onResult: (data) => {
      try {
        const output = (data.output ?? data.text ?? "") as string;
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

  const filtered = useMemo(() => {
    if (!epics) return [];
    if (!query.trim()) return epics;
    const q = query.toLowerCase();
    return epics.filter((e) => e.name.toLowerCase().includes(q) || e.key.toLowerCase().includes(q));
  }, [epics, query]);

  const staleCount = useMemo(() => {
    if (!epics) return 0;
    return epics.filter((e) => e.summaryStale).length;
  }, [epics]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await apiFetch("/api/jira/sync-epics", { method: "POST" });
      await mutate();
    } catch { /* non-critical */ } finally {
      setSyncing(false);
    }
  }, [mutate]);

  // Auto-sync once per session
  useEffect(() => {
    if (!open || hasSyncedRef.current || syncing) return;
    hasSyncedRef.current = true;
    handleSync();
  }, [open, syncing, handleSync]);

  const handleSearchChange = useCallback((value: string) => {
    if (value.trim()) {
      setSuggestions(null);
      setSuggestError(null);
    }
  }, []);

  const handleSuggestEpic = useCallback(async () => {
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

  const handleGenerateSummaries = useCallback(async () => {
    setSyncing(true);
    try { await apiFetch("/api/epics/generate-summaries", { method: "POST" }); } catch {} finally { setSyncing(false); }
  }, []);

  const suggestedKeys = useMemo(() => {
    if (!suggestions) return new Set<string>();
    return new Set(suggestions.map((s) => s.key));
  }, [suggestions]);

  const suggestionsSection = suggestions && suggestions.length > 0 && !query.trim() ? (
    <div className="border-b border-border-subtle py-1" style={{ backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 4%, transparent)" }}>
      <div className="px-3 pt-1 pb-0.5">
        <span className="text-caption font-medium uppercase tracking-wider" style={{ color: "var(--color-icon-epic)", opacity: 0.6 }}>AI Suggestions</span>
      </div>
      {suggestions.map((s) => {
        const conf = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;
        const isSelected = s.key === value?.key;
        return (
          <button
            key={`suggest-${s.key}`}
            type="button"
            onClick={() => { onChange({ key: s.key, name: s.name }); handleClose(); }}
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
  ) : null;

  const staleFooter = staleCount > 0 && !query.trim() ? (
    <div className="border-t border-border-subtle px-3 py-1.5 flex items-center justify-between">
      <span className="text-caption text-text-muted">{staleCount} stale {staleCount === 1 ? "summary" : "summaries"}</span>
      <button type="button" onClick={handleGenerateSummaries} disabled={syncing} className="text-caption text-[var(--color-icon-epic)] cursor-pointer hover:text-[#b48ee6] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40" style={{ transition: "color 0.15s ease" }}>Refresh</button>
    </div>
  ) : null;

  return (
    <>
      <BasePicker.Trigger
        title={value ? `Epic: ${value.name}` : "Select epic"}
        className="inline-flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 text-label font-medium cursor-pointer hover:bg-overlay-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
      >
        <Zap size={12} strokeWidth={1.5} className={`shrink-0 ${value ? "text-[var(--color-icon-epic)]" : "text-text-muted"}`} />
        <span className={`truncate max-w-[140px] ${value ? "text-[var(--color-icon-epic)] font-medium" : "text-text-muted"}`}>
          {value ? value.name : "Select epic"}
        </span>
      </BasePicker.Trigger>

      <BasePicker.Popover width="w-[280px]" footer={staleFooter}>
        {/* Custom search row with action buttons */}
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2">
          <Search size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); handleSearchChange(e.target.value); }}
            placeholder="Search epics..."
            className="flex-1 bg-transparent text-body-sm text-text-secondary placeholder:text-text-muted focus:outline-none"
          />
          {ticketKey && (
            <button type="button" onClick={handleSuggestEpic} disabled={suggesting} title="Suggest epic with AI" className="shrink-0 rounded p-0.5 text-[var(--color-icon-epic)] cursor-pointer hover:text-[#b48ee6] hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_8%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40" style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}>
              <Sparkles size={11} strokeWidth={1.5} className={suggesting ? "animate-pulse" : ""} />
            </button>
          )}
          <button type="button" onClick={handleSync} disabled={syncing} title="Sync epics from Jira" className="shrink-0 rounded p-0.5 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40" style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}>
            <RefreshCw size={11} strokeWidth={1.5} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>

        {/* AI suggestion loading */}
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

        {/* AI suggestion error */}
        {suggestError && !suggesting && (
          <div className="border-b border-border-subtle px-3 py-2">
            <p className="text-caption text-[var(--color-status-error)]">{suggestError}</p>
          </div>
        )}

        {/* AI suggestions */}
        {suggestionsSection}

        <BasePicker.List maxHeight="max-h-[280px]">
          {/* Remove epic option */}
          {!query.trim() && value && (
            <BasePicker.Item selected={false} onSelect={() => { onChange(null); handleClose(); }}>
              <span className="flex w-4 items-center justify-center shrink-0 text-text-muted">
                <X size={11} strokeWidth={1.5} />
              </span>
              <span className="text-text-secondary">Remove epic</span>
            </BasePicker.Item>
          )}

          {!epics && <BasePicker.Empty>Loading...</BasePicker.Empty>}
          {epics && filtered.length === 0 && (
            <BasePicker.Empty>{query.trim() ? "No epics found" : "No epics available"}</BasePicker.Empty>
          )}

          {filtered.map((epic) => {
            const isSelected = epic.key === value?.key;
            const isSuggested = suggestedKeys.has(epic.key);
            return (
              <BasePicker.Item
                key={epic.key}
                selected={isSelected}
                onSelect={() => { onChange({ key: epic.key, name: epic.name }); handleClose(); }}
                style={isSuggested && !query.trim() ? { backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 4%, transparent)" } : undefined}
              >
                <span className="flex w-4 items-center justify-center shrink-0 text-[var(--color-icon-epic)]">
                  <Zap size={11} strokeWidth={1.5} />
                </span>
                <span className={`flex-1 text-left truncate ${isSelected ? "text-text-primary font-medium" : "text-text-secondary"}`}>
                  {epic.name}
                </span>
                {epic.summaryStale && (
                  <span title="Summary outdated" className="shrink-0 flex items-center">
                    <AlertTriangle size={9} strokeWidth={1.5} className="text-[var(--color-status-warning)]" style={{ opacity: 0.5 }} />
                  </span>
                )}
                <span className="shrink-0 text-caption text-text-muted">{epic.key}</span>
              </BasePicker.Item>
            );
          })}
        </BasePicker.List>
      </BasePicker.Popover>
    </>
  );
}
