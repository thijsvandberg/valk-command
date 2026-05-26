"use client";

import { useState, useEffect } from "react";
import { Link2, Check, Loader2 } from "lucide-react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { tickets } from "@/lib/api-client";

export interface LinkSuggestion {
  key: string;
  relation: string;
}

interface ResolvedInfo {
  title: string;
  type: string;
}

interface LinkSuggestionChipsProps {
  suggestions: LinkSuggestion[];
  linkedIssueKeys: Set<string>;
  onLink: (targetKey: string, relation: string) => Promise<void>;
}

const RELATION_LABELS: Record<string, string> = {
  "relates to": "relates to",
  "blocks": "blocks",
  "is blocked by": "is blocked by",
  "clones": "clones",
  "is cloned by": "is cloned by",
  "duplicates": "duplicates",
  "is duplicated by": "is duplicated by",
};

export function LinkSuggestionChips({ suggestions, linkedIssueKeys, onLink }: LinkSuggestionChipsProps) {
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [linking, setLinking] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Record<string, ResolvedInfo>>({});

  useEffect(() => {
    let cancelled = false;
    const keysToResolve = suggestions
      .map((s) => s.key)
      .filter((k) => !resolved[k]);
    if (keysToResolve.length === 0) return;

    for (const key of keysToResolve) {
      tickets.searchForLink(key, undefined)
        .then((results) => {
          if (cancelled) return;
          const match = results.find((r) => r.key === key);
          if (match) {
            setResolved((prev) => ({ ...prev, [key]: { title: match.title, type: match.type } }));
          }
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (suggestions.length === 0) return null;

  const handleLink = async (key: string, relation: string) => {
    setLinking((prev) => new Set(prev).add(key));
    setErrors((prev) => { const next = new Set(prev); next.delete(key); return next; });
    try {
      await onLink(key, relation);
      setLinked((prev) => new Set(prev).add(key));
    } catch {
      setErrors((prev) => new Set(prev).add(key));
    } finally {
      setLinking((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border-default overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-overlay-subtle border-b border-border-default">
        <Link2 size={10} strokeWidth={1.5} className="text-text-muted" />
        <span className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Link suggestions
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {suggestions.map((s) => {
          const alreadyLinked = linkedIssueKeys.has(s.key);
          const justLinked = linked.has(s.key);
          const isLinking = linking.has(s.key);
          const hasError = errors.has(s.key);
          const relationLabel = RELATION_LABELS[s.relation] ?? s.relation;
          const info = resolved[s.key];

          return (
            <div
              key={s.key}
              className={`flex items-center gap-2.5 px-3 py-2 transition-colors duration-150 ${
                justLinked || alreadyLinked
                  ? "bg-[var(--color-brand-500)]/[0.04]"
                  : "hover:bg-overlay-subtle"
              }`}
            >
              <span className="text-caption text-text-muted shrink-0">{relationLabel}</span>
              {info && <IssueTypeIcon type={info.type} size={13} />}
              <span className="font-mono text-label text-[var(--color-brand-400)] shrink-0">{s.key}</span>
              {info && (
                <span className="min-w-0 flex-1 truncate text-label text-text-secondary">{info.title}</span>
              )}
              {!info && <span className="flex-1" />}
              {alreadyLinked ? (
                <span className="text-caption text-text-muted shrink-0">Already linked</span>
              ) : justLinked ? (
                <span className="flex items-center gap-1 text-caption font-medium text-emerald-400 shrink-0">
                  <Check size={10} strokeWidth={2.5} />
                  Linked
                </span>
              ) : hasError ? (
                <button
                  type="button"
                  onClick={() => handleLink(s.key, s.relation)}
                  className="shrink-0 text-caption font-medium text-red-400 cursor-pointer hover:text-red-300 transition-colors duration-150"
                >
                  Retry
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleLink(s.key, s.relation)}
                  disabled={isLinking}
                  className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium text-text-muted border border-border-default cursor-pointer hover:border-[var(--color-brand-500)]/25 hover:text-[var(--color-brand-500)] hover:bg-[var(--color-brand-500)]/[0.04] active:bg-[var(--color-brand-500)]/[0.08] transition-colors duration-150 disabled:opacity-50"
                >
                  {isLinking ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    "Link"
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
