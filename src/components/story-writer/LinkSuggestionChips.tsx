"use client";

import { useState, useEffect } from "react";
import { Link2 } from "lucide-react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { SuggestionCard, SuggestionRow, LinkButton } from "@/components/story-writer/SuggestionCard";
import { tickets } from "@/lib/api-client";
import type { JiraStatus, TicketReadiness } from "@/types/ticket";

export interface LinkSuggestion {
  key: string;
  relation: string;
}

interface ResolvedInfo {
  title: string;
  type: string;
  status: string;
  readiness: TicketReadiness | null;
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
      tickets.get(key)
        .then((data) => {
          if (cancelled) return;
          if (data) {
            setResolved((prev) => ({
              ...prev,
              [key]: {
                title: data.title,
                type: data.type,
                status: data.jiraStatus,
                readiness: data.readiness,
              },
            }));
          }
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (suggestions.length === 0) return null;

  // Group suggestions by relation type, preserving order of first appearance
  const groupedRelations: [string, LinkSuggestion[]][] = [];
  const groupMap = new Map<string, LinkSuggestion[]>();
  for (const s of suggestions) {
    const existing = groupMap.get(s.relation);
    if (existing) {
      existing.push(s);
    } else {
      const group = [s];
      groupMap.set(s.relation, group);
      groupedRelations.push([s.relation, group]);
    }
  }

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
    <SuggestionCard
      icon={<Link2 size={10} strokeWidth={1.5} className="text-text-muted" />}
      title="Link suggestions"
    >
      {groupedRelations.map(([relation, items]) => {
        const relationLabel = RELATION_LABELS[relation] ?? relation;
        return (
          <div key={relation}>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-primary border-b border-border-subtle">
              <span className="text-caption text-text-muted">{relationLabel}</span>
            </div>
            {items.map((s) => {
              const alreadyLinked = linkedIssueKeys.has(s.key);
              const justLinked = linked.has(s.key);
              const isLinking = linking.has(s.key);
              const hasError = errors.has(s.key);
              const info = resolved[s.key];

              return (
                <SuggestionRow key={s.key} active={justLinked || alreadyLinked}>
                  <TicketStatusPill
                    ticketKey={s.key}
                    issueType={info?.type ?? "task"}
                    jiraStatus={(info?.status ?? "TO DO") as JiraStatus}
                    readiness={info?.readiness ?? undefined}
                    title={info?.title}
                    size="sm"
                    variant="list"
                  />
                  {info ? (
                    <span className="min-w-0 flex-1 truncate text-label text-text-secondary">{info.title}</span>
                  ) : (
                    <span className="min-w-0 flex-1">
                      <span className="block h-3.5 w-3/4 rounded bg-surface-secondary animate-pulse" />
                    </span>
                  )}
                  <LinkButton
                    linked={alreadyLinked || justLinked}
                    loading={isLinking}
                    error={hasError}
                    onLink={() => handleLink(s.key, s.relation)}
                  />
                </SuggestionRow>
              );
            })}
          </div>
        );
      })}
    </SuggestionCard>
  );
}
