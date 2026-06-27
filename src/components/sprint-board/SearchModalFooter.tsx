"use client";

import { useRef } from "react";
import { PanelRight, PanelRightClose, Bookmark, BookmarkCheck, Check, X } from "lucide-react";
import type { VisibleRow } from "@/components/sprint-board/useSearchKeyboard";
import type { FocusedPanel } from "@/components/sprint-board/SearchResultParts";

interface SearchModalFooterProps {
  mode: "local" | "jira";
  previewEnabled: boolean;
  setPreviewEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  activeIdx: number;
  visibleRows: VisibleRow[];
  focusedPanel: FocusedPanel;
  query: string;
  isCurrentSearchSaved: boolean;
  isFull: boolean;
  savingSearch: boolean;
  saveLabel: string;
  setSaveLabel: (v: string) => void;
  onSaveOpen: () => void;
  onSaveConfirm: () => void;
  onSaveCancel: () => void;
  saveInputRef: React.RefObject<HTMLInputElement | null>;
}

export function SearchModalFooter({
  mode, previewEnabled, setPreviewEnabled, activeIdx, visibleRows, focusedPanel,
  query, isCurrentSearchSaved, isFull, savingSearch, saveLabel, setSaveLabel,
  onSaveOpen, onSaveConfirm, onSaveCancel, saveInputRef,
}: SearchModalFooterProps) {
  return (
    <div className="flex items-center gap-4 border-t border-border-default px-6 py-3 text-caption text-text-muted">
      <span><kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono">{"\u2191\u2193"}</kbd> navigate</span>
      <span><kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono">{"\u21b5"}</kbd> open</span>
      {mode === "local" && previewEnabled && activeIdx >= 0 && visibleRows[activeIdx]?.group === "tickets" && (
        <span><kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono">{"\u2192"}</kbd> preview</span>
      )}
      {focusedPanel === "preview" && (
        <span><kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono">{"\u2190"}</kbd> list</span>
      )}
      <span><kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono">{"\u21e7\u21b5"}</kbd> new tab</span>
      <span><kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono">esc</kbd> close</span>
      <div className="flex-1" />
      {mode === "local" && query.trim().length >= 2 && (
        savingSearch ? (
          <SaveSearchInput
            saveLabel={saveLabel}
            setSaveLabel={setSaveLabel}
            onConfirm={onSaveConfirm}
            onCancel={onSaveCancel}
            saveInputRef={saveInputRef}
          />
        ) : (
          <button
            type="button"
            disabled={isCurrentSearchSaved || isFull}
            title={isCurrentSearchSaved ? "Already saved" : isFull ? "Max 10 saved searches reached" : "Save this search"}
            onClick={onSaveOpen}
            className="flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-default"
            style={{
              backgroundColor: isCurrentSearchSaved ? "var(--color-brand-subtle)" : "var(--color-overlay-subtle)",
              color: isCurrentSearchSaved ? "var(--color-brand-400)" : isFull ? "var(--color-overlay-strong)" : "var(--color-text-muted)",
              transition: "background-color 120ms, color 120ms",
            }}
          >
            {isCurrentSearchSaved
              ? <BookmarkCheck className="h-3 w-3" strokeWidth={1.5} />
              : <Bookmark className="h-3 w-3" strokeWidth={1.5} />}
            {isCurrentSearchSaved ? "Saved" : "Save"}
          </button>
        )
      )}
      {mode === "local" && (
        <button
          type="button"
          onClick={() => setPreviewEnabled((v: boolean) => !v)}
          className="flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          style={{
            backgroundColor: previewEnabled ? "var(--color-brand-subtle)" : "var(--color-overlay-subtle)",
            color: previewEnabled ? "var(--color-brand-400)" : "var(--color-text-muted)",
            transition: "background-color 120ms, color 120ms",
          }}
        >
          {previewEnabled ? <PanelRightClose className="h-3 w-3" strokeWidth={1.5} /> : <PanelRight className="h-3 w-3" strokeWidth={1.5} />}
          Preview
        </button>
      )}
    </div>
  );
}

function SaveSearchInput({
  saveLabel, setSaveLabel, onConfirm, onCancel, saveInputRef,
}: {
  saveLabel: string;
  setSaveLabel: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  saveInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="flex items-center gap-1"
      style={{ animation: "saveInputIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)" }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
      }}
    >
      <div
        className="flex items-center gap-1.5 overflow-hidden rounded-md"
        style={{
          backgroundColor: "var(--color-overlay-default)",
          border: "1px solid color-mix(in srgb, var(--color-status-success) 35%, transparent)",
          padding: "2px 6px 2px 8px",
        }}
      >
        <Bookmark className="h-3 w-3 shrink-0" style={{ color: "var(--color-brand-400)", opacity: 0.7 }} strokeWidth={1.5} />
        <input
          ref={saveInputRef}
          type="text"
          value={saveLabel}
          onChange={(e) => setSaveLabel(e.target.value)}
          placeholder="Name this search..."
          maxLength={200}
          className="bg-transparent text-body-sm text-text-primary placeholder-text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-500)]/50"
          style={{ width: 160 }}
        />
        <button
          type="button"
          onClick={onConfirm}
          disabled={!saveLabel.trim()}
          title="Save"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          style={{
            backgroundColor: saveLabel.trim() ? "color-mix(in srgb, var(--color-status-success) 20%, transparent)" : "transparent",
            color: saveLabel.trim() ? "var(--color-brand-400)" : "var(--color-text-muted)",
            transition: "background-color 100ms, color 100ms",
          }}
        >
          <Check className="h-3 w-3" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          title="Cancel"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          style={{ color: "var(--color-text-muted)", transition: "color 100ms" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
