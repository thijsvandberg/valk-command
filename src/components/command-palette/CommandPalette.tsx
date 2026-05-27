"use client";

import { createPortal } from "react-dom";
import { Search, ArrowRight, ChevronLeft } from "lucide-react";

import { CATEGORY_LABELS } from "./palette-data";
import { SubFlowForm } from "./SubFlowForm";
import { ResultIcon, ResultLabel } from "./ResultItem";
import { useCommandPalette } from "./useCommandPalette";
import type { ResultCategory } from "./types";

export function CommandPalette() {
  const {
    open,
    closing,
    epicMode,
    query,
    setQuery,
    activeIdx,
    setActiveIdx,
    subFlow,
    setSubFlow,
    allResults,
    loadingTickets,
    loadingConversations,
    inputRef,
    subFlowInputRef,
    listRef,
    handleClose,
    handleKeyDown,
    handleSubFlowConfirm,
    executeResult,
  } = useCommandPalette();

  if (!open) return null;

  // Group results by category for section headers
  const grouped: { category: ResultCategory; items: typeof allResults }[] = [];
  for (const result of allResults) {
    const last = grouped[grouped.length - 1];
    if (last && last.category === result.category) {
      last.items.push(result);
    } else {
      grouped.push({ category: result.category, items: [result] });
    }
  }

  // Flat index tracker for active highlighting
  let flatIdx = 0;

  const isLoading = loadingTickets || loadingConversations;
  const isSubFlow = subFlow.kind === "new-story";

  return createPortal(
    <div
      className={`fixed inset-0 z-tooltip flex items-start justify-center px-4 pt-[15vh] ${closing ? "cmd-palette-backdrop-out" : "cmd-palette-backdrop-in"}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Backdrop blur layer */}
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[6px]" />

      {/* Palette container */}
      <div
        className={`relative z-10 w-full max-w-[560px] overflow-hidden rounded-2xl border border-border-strong ${closing ? "cmd-palette-out" : "cmd-palette-in"}`}
        style={{
          backgroundColor: "var(--color-surface-floating)",
          boxShadow:
            "0 0 0 1px var(--color-overlay-subtle), 0 24px 64px rgba(0,0,0,0.65), 0 8px 24px rgba(0,0,0,0.4), 0 0 80px rgba(19,69,128,0.08)",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input row (or sub-flow breadcrumb) */}
        {isSubFlow ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <button
              type="button"
              onClick={() => { setSubFlow({ kind: "none" }); requestAnimationFrame(() => inputRef.current?.focus()); }}
              className="flex items-center justify-center h-[18px] w-[18px] shrink-0 text-text-tertiary hover:text-text-secondary transition-colors duration-75 cursor-pointer"
              aria-label="Back to palette"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </button>
            <span className="flex-1 text-heading-sm text-text-secondary font-[var(--font-body)]">New Story</span>
            <kbd className="hidden sm:flex items-center rounded-md border border-border-strong bg-overlay-subtle px-1.5 py-0.5 text-caption font-mono text-text-muted tracking-wide">
              ESC
            </kbd>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-5 py-4">
            <Search className="h-[18px] w-[18px] shrink-0 text-text-muted" strokeWidth={1.5} />
            {epicMode && (
              <span className="shrink-0 rounded-md bg-[#9b6cd4]/15 px-2 py-0.5 text-caption font-semibold text-[#9b6cd4] tracking-wide">
                Epics
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={epicMode ? "Search epics..." : "Search pages, tickets, or actions..."}
              className="flex-1 bg-transparent text-heading-sm text-text-primary placeholder-text-muted focus:outline-none font-[var(--font-body)]"
              spellCheck={false}
              autoComplete="off"
            />
            {isLoading && (
              <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-white/40" />
            )}
            <kbd className="hidden sm:flex items-center rounded-md border border-border-strong bg-overlay-subtle px-1.5 py-0.5 text-caption font-mono text-text-muted tracking-wide">
              ESC
            </kbd>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-overlay-default" />

        {/* Sub-flow form or results list */}
        {isSubFlow ? (
          <SubFlowForm
            subFlow={subFlow}
            subFlowInputRef={subFlowInputRef}
            onModeChange={(mode) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, mode, error: null } : prev)
            }
            onTitleChange={(title) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, title } : prev)
            }
            onSprintChange={(sprintId) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, sprintId } : prev)
            }
            onExistingKeyChange={(existingKey) =>
              setSubFlow((prev) => prev.kind === "new-story" ? { ...prev, existingKey } : prev)
            }
            onConfirm={handleSubFlowConfirm}
            onCancel={() => { setSubFlow({ kind: "none" }); requestAnimationFrame(() => inputRef.current?.focus()); }}
          />
        ) : (
          <div
            ref={listRef}
            className="overflow-y-auto py-2"
            style={{
              maxHeight: 380,
              scrollbarWidth: "thin",
              scrollbarColor: "var(--color-overlay-default) transparent",
            }}
          >
            {allResults.length === 0 && query.trim().length > 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-12 text-text-muted text-body-lg">
                <Search className="h-8 w-8 mb-3 text-text-muted" strokeWidth={1} />
                <span>No results for &ldquo;{query}&rdquo;</span>
              </div>
            )}

            {grouped.map((group) => {
              const sectionStartIdx = flatIdx;
              return (
                <div key={`${group.category}-${sectionStartIdx}`}>
                  {/* Section header */}
                  <div className="px-5 pt-3 pb-1.5 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted font-[var(--font-body)]">
                    {CATEGORY_LABELS[group.category]}
                  </div>

                  {group.items.map((result) => {
                    const idx = flatIdx++;
                    const isActive = idx === activeIdx;

                    return (
                      <div
                        key={result.id}
                        data-palette-row=""
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => executeResult(result)}
                        className={`group flex items-center gap-3 mx-2 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-75 ${
                          isActive
                            ? "bg-overlay-default"
                            : "hover:bg-overlay-subtle"
                        }`}
                      >
                        <ResultIcon result={result} isActive={isActive} />
                        <ResultLabel result={result} isActive={isActive} />
                        {isActive && (
                          <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-text-muted" strokeWidth={1.5} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-border-default px-5 py-2.5 text-caption text-text-muted">
          {isSubFlow ? (
            <>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono text-text-muted">{"\u21b5"}</kbd>
                <span className="text-text-muted">confirm</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono text-text-muted">esc</kbd>
                <span className="text-text-muted">back</span>
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono text-text-muted">{"\u2191\u2193"}</kbd>
                <span className="text-text-muted">navigate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono text-text-muted">{"\u21b5"}</kbd>
                <span className="text-text-muted">open</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="rounded border border-border-strong bg-overlay-subtle px-1 py-0.5 font-mono text-text-muted">esc</kbd>
                <span className="text-text-muted">close</span>
              </span>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes cmdPaletteBackdropIn {
          from { background-color: rgba(0,0,0,0); }
          to { background-color: rgba(0,0,0,0.5); }
        }
        @keyframes cmdPaletteBackdropOut {
          from { background-color: rgba(0,0,0,0.5); }
          to { background-color: rgba(0,0,0,0); }
        }
        @keyframes cmdPaletteIn {
          from { opacity: 0; transform: scale(0.95) translateY(-8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes cmdPaletteOut {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.95) translateY(-8px); }
        }
        .cmd-palette-backdrop-in {
          animation: cmdPaletteBackdropIn 0.15s ease-out forwards;
        }
        .cmd-palette-backdrop-out {
          animation: cmdPaletteBackdropOut 0.12s ease-in forwards;
        }
        .cmd-palette-in {
          animation: cmdPaletteIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .cmd-palette-out {
          animation: cmdPaletteOut 0.12s ease-in forwards;
        }
      `}</style>
    </div>,
    document.body,
  );
}
