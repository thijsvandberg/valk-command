"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Check, Search, Zap, X, RefreshCw, Sparkles, AlertTriangle, ArrowUpRight, ExternalLink, PanelRight } from "lucide-react";
import { BasePicker } from "@/components/shared/BasePicker";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
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
  textClass = "text-label",
  emptyLabel = "Select epic",
  emptyTriggerClassName,
  triggerClassName,
  onViewInSidebar,
}: {
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  align?: "left" | "right";
  ticketKey?: string;
  onOpenChange?: (open: boolean) => void;
  // Trigger font-size utility. Defaults to the compact pill size; the ticket
  // detail sidebar overrides this to align with its other 14px values.
  textClass?: string;
  // Empty-state (no epic) trigger overrides, used by the ghost "Add epic"
  // placeholder on issue rows (BRDG-131).
  emptyLabel?: string;
  emptyTriggerClassName?: string;
  // Extra classes for the selected-value trigger (e.g. `min-w-0 shrink` so the
  // epic pill yields space in a dense board row).
  triggerClassName?: string;
  // When provided, the dropdown's primary action becomes "View in sidebar"
  // (opening the epic in the side panel) instead of navigating to its full page,
  // and an explicit "open in new tab" action is shown alongside (BRDG-131).
  onViewInSidebar?: () => void;
}) {
  return (
    <BasePicker.Root portal={true} align={align} popoverHeight={300} onOpenChange={onOpenChange}>
      <EpicPickerInner value={value} onChange={onChange} ticketKey={ticketKey} textClass={textClass} emptyLabel={emptyLabel} emptyTriggerClassName={emptyTriggerClassName} triggerClassName={triggerClassName} onViewInSidebar={onViewInSidebar} />
    </BasePicker.Root>
  );
}

function EpicPickerInner({
  value,
  onChange,
  ticketKey,
  textClass,
  emptyLabel,
  emptyTriggerClassName,
  triggerClassName,
  onViewInSidebar,
}: {
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  ticketKey?: string;
  textClass: string;
  emptyLabel: string;
  emptyTriggerClassName?: string;
  triggerClassName?: string;
  onViewInSidebar?: () => void;
}) {
  const { open, handleClose } = BasePicker.useContext();

  return (
    <>
      <BasePicker.Trigger
        // No native title: a set epic shows the styled EpicBadge tooltip; the
        // empty state renders emptyLabel as visible text.
        className={
          value
            ? `inline-flex min-w-0 max-w-full items-center rounded-md cursor-pointer transition-[box-shadow,transform] duration-150 hover:ring-1 hover:ring-inset hover:ring-border-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]${triggerClassName ? ` ${triggerClassName}` : ""}`
            : emptyTriggerClassName
              // Keep the override visible while its popover is open, otherwise a
              // hover-reveal ghost trigger vanishes the moment the cursor leaves
              // the row to enter the popover.
              ? `${emptyTriggerClassName}${open ? " opacity-100" : ""}`
              : `inline-flex items-center gap-1.5 rounded-md bg-overlay-default px-2 py-0.5 ${textClass} font-medium text-text-muted cursor-pointer hover:bg-overlay-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]`
        }
      >
        {value ? (
          <EpicBadge epic={value.name} className="max-w-full" />
        ) : (
          <>
            <Zap size={12} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate max-w-[140px]">{emptyLabel}</span>
          </>
        )}
      </BasePicker.Trigger>

      <BasePicker.Popover width="w-[320px]">
        <EpicPickerBody
          value={value}
          onChange={onChange}
          onClose={handleClose}
          ticketKey={ticketKey}
          onViewInSidebar={onViewInSidebar}
        />
      </BasePicker.Popover>
    </>
  );
}

/**
 * The popover body of the epic picker: search row (search + AI suggest + Jira
 * sync), AI suggestions, the View/Unlink action row (when an epic is set), the
 * epic list, and the stale-summary footer. Container-agnostic so it renders both
 * inside `BasePicker.Popover` (the sidebar/board-row `EpicPicker`) and directly
 * inside a row/bulk menu card. It owns its own search state and closes via the
 * `onClose` prop instead of `BasePicker` context (BRDG-381).
 *
 * - `value` set     -> View/Unlink actions + a checkmark on the selected epic.
 * - `ticketKey` set -> single-ticket AI "suggest epic" action (hidden otherwise).
 * - `clearable`     -> when no epic is set, show a single "Remove epic" action
 *                      (used by multi-select bulk, which has no single value).
 */
export function EpicPickerBody({
  value,
  onChange,
  onClose,
  ticketKey,
  onViewInSidebar,
  clearable = false,
}: {
  value: EpicOption | null;
  onChange: (epic: EpicOption | null) => void;
  onClose: () => void;
  ticketKey?: string;
  onViewInSidebar?: () => void;
  clearable?: boolean;
}) {
  const [query, setQuery] = useState("");

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

  // Pull newly-created epics from Jira when the picker opens. The popover / menu
  // card mounts this body fresh on each open, so a once-per-mount sync keeps the
  // list current without forcing a full page reload.
  useEffect(() => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    handleSync();
  }, [handleSync]);

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
            onClick={() => { onChange({ key: s.key, name: s.name }); onClose(); }}
            className="flex w-full items-start gap-2.5 px-3 py-[7px] text-body-sm cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_8%,transparent)] active:bg-[color-mix(in_srgb,var(--color-icon-epic)_12%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
      <button type="button" onClick={handleGenerateSummaries} disabled={syncing} className="text-caption text-[var(--color-icon-epic)] cursor-pointer hover:text-[var(--color-icon-epic-hover)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40" style={{ transition: "color 0.15s ease" }}>Refresh</button>
    </div>
  ) : null;

  return (
    <>
      {/* Search row: search + AI suggest (single-ticket only) + Jira sync. The
          whole body is shared with the sidebar EpicPicker, so the surfaces are
          identical by construction (BRDG-381). */}
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2">
        <Search size={12} strokeWidth={1.5} className="shrink-0 text-text-muted" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); handleSearchChange(e.target.value); }}
          placeholder="Search epics..."
          className="flex-1 bg-transparent text-body-sm text-text-secondary placeholder:text-text-muted focus:outline-none"
        />
        {ticketKey && (
          <button type="button" onClick={handleSuggestEpic} disabled={suggesting} title="Suggest epic with AI" aria-label="Suggest epic with AI" className="shrink-0 rounded p-0.5 text-[var(--color-icon-epic)] cursor-pointer hover:text-[var(--color-icon-epic-hover)] hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_8%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40" style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}>
            <Sparkles size={11} strokeWidth={1.5} className={suggesting ? "animate-pulse" : ""} />
          </button>
        )}
        <button type="button" onClick={handleSync} disabled={syncing} title="Sync epics from Jira" aria-label="Sync epics from Jira" className="shrink-0 rounded p-0.5 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-40" style={{ transition: "color 0.15s ease, background-color 0.15s ease" }}>
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

      {/* Actions for the currently-selected epic, sitting side-by-side above
          a divider so they read as actions, not as selectable epic options.
          On the board (onViewInSidebar set) the primary action opens the epic in
          the side panel, with an explicit "open in new tab" alongside; elsewhere
          it links straight to the epic's full page (cmd-click for a new tab). */}
      {!query.trim() && value && (
        <div className="flex items-stretch gap-1.5 border-b border-border-subtle px-2 py-2">
          {onViewInSidebar ? (
            <>
              <button
                type="button"
                onClick={() => { onViewInSidebar(); onClose(); }}
                title="View epic in the side panel"
                aria-label={`View epic ${value.name} in the side panel`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-semibold text-[var(--color-icon-epic)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_16%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 10%, transparent)", transition: "background-color 0.15s ease, transform 0.15s ease" }}
              >
                <PanelRight size={13} strokeWidth={2.25} className="shrink-0" />
                <span className="truncate">View epic</span>
              </button>
              <a
                href={`/tickets/${value.key}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                title={`Open epic ${value.key} in a new tab`}
                aria-label={`Open epic ${value.name} in a new tab`}
                className="flex items-center justify-center rounded-lg px-2 py-1.5 text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.15s ease" }}
              >
                <ExternalLink size={13} strokeWidth={1.75} className="shrink-0" />
              </a>
              <button
                type="button"
                onClick={() => { onChange(null); onClose(); }}
                title="Unlink this epic from the ticket"
                aria-label="Unlink epic"
                className="flex items-center justify-center rounded-lg px-2 py-1.5 text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.15s ease" }}
              >
                <X size={13} strokeWidth={1.75} className="shrink-0" />
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/tickets/${value.key}`}
                onClick={onClose}
                title={`View epic ${value.key}`}
                aria-label={`View epic ${value.name}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-semibold text-[var(--color-icon-epic)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-icon-epic)_16%,transparent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ backgroundColor: "color-mix(in srgb, var(--color-icon-epic) 10%, transparent)", transition: "background-color 0.15s ease, transform 0.15s ease" }}
              >
                <ArrowUpRight size={13} strokeWidth={2.25} className="shrink-0" />
                <span className="truncate">View epic</span>
              </Link>
              <button
                type="button"
                onClick={() => { onChange(null); onClose(); }}
                title="Unlink this epic from the ticket"
                className="flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.15s ease" }}
              >
                <X size={12} strokeWidth={1.5} className="shrink-0" />
                <span className="truncate">Unlink epic</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Bulk clear: no single epic is selected, but the caller (multi-select)
          allows clearing the epic from all targets. */}
      {!query.trim() && !value && clearable && (
        <div className="flex items-stretch gap-1.5 border-b border-border-subtle px-2 py-2">
          <button
            type="button"
            onClick={() => { onChange(null); onClose(); }}
            title="Remove the epic from the selected tickets"
            aria-label="Remove epic"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.15s ease" }}
          >
            <X size={12} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">Remove epic</span>
          </button>
        </div>
      )}

      <BasePicker.List maxHeight="max-h-[280px]">
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
              asDiv
              selected={isSelected}
              onSelect={() => { onChange({ key: epic.key, name: epic.name }); onClose(); }}
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
              <Link
                href={`/tickets/${epic.key}`}
                onClick={(e) => e.stopPropagation()}
                title={`Open ${epic.key}`}
                className="shrink-0 rounded text-caption text-text-muted cursor-pointer hover:text-[var(--color-icon-epic)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:opacity-70"
                style={{ transition: "color 0.15s ease" }}
              >
                {epic.key}
              </Link>
            </BasePicker.Item>
          );
        })}
      </BasePicker.List>

      {staleFooter}
    </>
  );
}
