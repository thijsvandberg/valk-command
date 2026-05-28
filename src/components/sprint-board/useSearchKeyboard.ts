import { useCallback, useEffect, type RefObject } from "react";
import type { FocusedPanel } from "@/components/sprint-board/SearchResultParts";
import type { LocalSearchResult, ConversationSearchResult, CommentSearchResult } from "@/lib/local-search-engine";
import type { JiraSearchResult } from "@/app/api/search/jira/route";

export type SearchMode = "local" | "jira";

export type VisibleRow =
  | { group: "tickets"; item: LocalSearchResult }
  | { group: "conversations"; item: ConversationSearchResult }
  | { group: "comments"; item: CommentSearchResult };

interface UseSearchKeyboardOpts {
  mode: SearchMode;
  focusedPanel: FocusedPanel;
  activeIdx: number;
  setActiveIdx: (v: number | ((prev: number) => number)) => void;
  visibleRows: VisibleRow[];
  jiraResults: JiraSearchResult[];
  previewEnabled: boolean;
  setPreviewEnabled: (v: boolean) => void;
  setFocusedPanel: (v: FocusedPanel) => void;
  previewPaneRef: RefObject<HTMLDivElement | null>;
  listRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  detectedKey: string | null;
  navigateToKey: (key: string, newTab: boolean) => void;
  onLocalResultSelect: (row: VisibleRow, newTab: boolean) => void;
  onJiraResultSelect: (issue: JiraSearchResult, newTab: boolean) => void;
  onRunJiraSearch: () => void;
  loadingJira: boolean;
}

export function useSearchKeyboard(opts: UseSearchKeyboardOpts) {
  const {
    mode, focusedPanel, activeIdx, setActiveIdx,
    visibleRows, jiraResults, previewEnabled, setPreviewEnabled,
    setFocusedPanel, previewPaneRef, listRef, inputRef,
    detectedKey, navigateToKey, onLocalResultSelect, onJiraResultSelect,
    onRunJiraSearch, loadingJira,
  } = opts;

  const jiraResultCount = jiraResults.length;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (focusedPanel === "preview") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        previewPaneRef.current?.scrollBy({ top: 80, behavior: "smooth" });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        previewPaneRef.current?.scrollBy({ top: -80, behavior: "smooth" });
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusedPanel("list");
        inputRef.current?.focus();
        return;
      }
      return;
    }

    if (mode === "local") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(activeIdx + 1, visibleRows.length - 1);
        setActiveIdx(next);
        if (next >= 0) setPreviewEnabled(true);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(activeIdx - 1, 0);
        setActiveIdx(next);
        if (next >= 0) setPreviewEnabled(true);
        return;
      }
      if (e.key === "ArrowRight" && previewEnabled && activeIdx >= 0) {
        const row = visibleRows[activeIdx];
        if (row?.group === "tickets") {
          e.preventDefault();
          setFocusedPanel("preview");
          return;
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (detectedKey) {
          navigateToKey(detectedKey, e.shiftKey);
          return;
        }
        const row = visibleRows[activeIdx];
        if (!row) return;
        onLocalResultSelect(row, e.shiftKey);
        return;
      }
    } else {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i: number) => Math.min(i + 1, jiraResultCount - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i: number) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (detectedKey) {
          navigateToKey(detectedKey, e.shiftKey);
          return;
        }
        if (loadingJira) return;
        if (jiraResults.length > 0) {
          const issue = jiraResults[activeIdx];
          if (issue) onJiraResultSelect(issue, e.shiftKey);
        } else {
          onRunJiraSearch();
        }
      }
    }
  }, [focusedPanel, activeIdx, mode, visibleRows, jiraResults, jiraResultCount, previewEnabled, loadingJira, detectedKey, navigateToKey, setFocusedPanel, setActiveIdx, setPreviewEnabled, previewPaneRef, inputRef, onLocalResultSelect, onJiraResultSelect, onRunJiraSearch]);

  // Scroll active row into view
  useEffect(() => {
    if (activeIdx < 0) return;
    const list = listRef.current;
    if (!list) return;
    const rows = list.querySelectorAll("[data-result-row]");
    const row = rows[activeIdx] as HTMLElement | undefined;
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeIdx, listRef]);

  return { handleKeyDown };
}
