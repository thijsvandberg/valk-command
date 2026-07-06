"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2, Check, X, Link2 } from "lucide-react";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { tickets } from "@/lib/api-client";

interface LinkExistingStoryModalProps {
  open: boolean;
  epicKey: string;
  onClose: () => void;
  onLink: (jiraKeys: string[]) => Promise<void>;
}

interface Row {
  key: string;
  title: string;
  type: string;
  epicKey: string | null;
}

/**
 * Picks existing stories to re-parent into the epic as children (BRDG-487).
 * Searches via the shared ticket-search endpoint, excludes the epic itself and
 * any epics, and links the selected stories in one confirm.
 */
export function LinkExistingStoryModal({ open, epicKey, onClose, onLink }: LinkExistingStoryModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(new Set());
      setLinking(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await tickets.searchForLinkWithJira(q, epicKey, 0, undefined, controller.signal) as {
          results?: Array<{ key: string; title: string; type?: string; epicKey?: string | null }>;
        };
        const rows = (data.results ?? [])
          .filter((r) => (r.type ?? "").toLowerCase() !== "epic" && r.key !== epicKey)
          .map((r) => ({ key: r.key, title: r.title, type: r.type ?? "story", epicKey: r.epicKey ?? null }));
        setResults(rows);
      } catch {
        // aborted or failed; leave prior results
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open, epicKey]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleLink = useCallback(async () => {
    if (selected.size === 0) return;
    setLinking(true);
    try {
      await onLink([...selected]);
      onClose();
    } finally {
      setLinking(false);
    }
  }, [selected, onLink, onClose]);

  if (!open) return null;

  return (
    <Modal open onClose={onClose} aria-label="Link existing story to epic">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border-strong bg-surface-floating shadow-xl">
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
            <Link2 size={15} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />
            Link existing story
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="border-b border-border-default px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 focus-within:border-[var(--color-brand-500)]/40">
            <Search size={14} strokeWidth={1.75} className="shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by key or title (min. 2 chars)…"
              className="min-w-0 flex-1 bg-transparent text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            {searching && <Loader2 size={13} strokeWidth={1.75} className="shrink-0 animate-spin text-text-muted" />}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {query.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-body-sm text-text-muted">
              Type at least 2 characters to search.
            </p>
          ) : results.length === 0 && !searching ? (
            <p className="px-3 py-6 text-center text-body-sm text-text-muted">No matching stories.</p>
          ) : (
            results.map((r) => {
              const isSelected = selected.has(r.key);
              const alreadyInThisEpic = r.epicKey === epicKey;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => toggle(r.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    isSelected ? "bg-[var(--color-brand-500)]/[0.1]" : "hover:bg-hover-list-item"
                  }`}
                >
                  <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                    isSelected ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/20" : "border-border-strong"
                  }`}>
                    {isSelected && <Check size={11} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />}
                  </span>
                  <IssueTypeIcon type={r.type} size={13} />
                  <span className="shrink-0 font-mono text-label text-text-tertiary">{r.key}</span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{r.title}</span>
                  {alreadyInThisEpic && (
                    <span className="shrink-0 text-caption text-text-muted">already linked</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border-default px-5 py-3">
          <span className="text-label text-text-muted">
            {selected.size > 0 ? `${selected.size} selected` : "Select stories to link"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" onClick={onClose} disabled={linking}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleLink}
              disabled={selected.size === 0 || linking}
              icon={linking ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} strokeWidth={1.75} />}
            >
              {linking ? "Linking…" : `Link ${selected.size || ""}`.trim()}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
