"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { SuggestionCard, SuggestionRow, LinkButton } from "@/components/story-writer/SuggestionCard";
import { tickets } from "@/lib/api-client";
import type { JiraStatus, TicketReadiness } from "@/types/ticket";

export interface EpicSuggestion {
  key: string;
  name: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

const CONFIDENCE_STYLES: Record<string, { color: string; label: string }> = {
  high: { color: "var(--color-status-success)", label: "High" },
  medium: { color: "var(--color-status-caution)", label: "Medium" },
  low: { color: "var(--color-icon-epic)", label: "Low" },
};

interface ResolvedInfo {
  status: string;
  readiness: TicketReadiness | null;
  title: string | null;
}

interface EpicSuggestionCardProps {
  suggestions: EpicSuggestion[];
  currentEpicKey: string | null | undefined;
  onApply: (epicKey: string) => Promise<void>;
}

export function EpicSuggestionCard({ suggestions, currentEpicKey, onApply }: EpicSuggestionCardProps) {
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<Set<string>>(new Set());
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
                status: data.jiraStatus,
                readiness: data.readiness,
                title: data.title || null,
              },
            }));
          }
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (suggestions.length === 0) return null;

  const handleApply = async (epicKey: string) => {
    setApplying((prev) => new Set(prev).add(epicKey));
    setErrors((prev) => { const next = new Set(prev); next.delete(epicKey); return next; });
    try {
      await onApply(epicKey);
      setApplied((prev) => new Set(prev).add(epicKey));
    } catch {
      setErrors((prev) => new Set(prev).add(epicKey));
    } finally {
      setApplying((prev) => { const next = new Set(prev); next.delete(epicKey); return next; });
    }
  };

  return (
    <SuggestionCard
      icon={<Zap size={10} strokeWidth={1.5} className="text-text-muted" />}
      title="Epic suggestion"
    >
      {suggestions.map((s) => {
        const isCurrent = currentEpicKey === s.key;
        const justApplied = applied.has(s.key);
        const isSelected = isCurrent || justApplied;
        const isApplying = applying.has(s.key);
        const hasError = errors.has(s.key);
        const conf = CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low;
        const info = resolved[s.key];
        const displayName = (info?.title) || (s.name !== s.key ? s.name : s.key);

        return (
          <SuggestionRow key={s.key} active={isSelected} align="start">
            <div className="flex w-full flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <TicketStatusPill
                  ticketKey={s.key}
                  issueType="epic"
                  jiraStatus={(info?.status ?? "TO DO") as JiraStatus}
                  title={displayName}
                  size="sm"
                  variant="list"
                />
                <span className={`min-w-0 flex-1 truncate text-label ${isSelected ? "text-text-primary" : "text-text-secondary"}`}>
                  {displayName}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-caption font-medium text-text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: conf.color }} />
                  {conf.label}
                </span>
                {isSelected ? (
                  <span className="shrink-0 rounded-md px-2.5 py-1 text-caption font-medium bg-[var(--color-brand-500)]/[0.1] text-[var(--color-brand-500)]">
                    Applied
                  </span>
                ) : (
                  <LinkButton
                    linked={false}
                    loading={isApplying}
                    error={hasError}
                    onLink={() => handleApply(s.key)}
                  />
                )}
              </div>
              <div
                className="border-l-2 pl-2.5"
                style={{ borderColor: "color-mix(in srgb, var(--color-brand-500) 35%, transparent)" }}
              >
                <span className="text-caption text-text-muted leading-[1.5]">
                  {s.reason}
                </span>
              </div>
            </div>
          </SuggestionRow>
        );
      })}
    </SuggestionCard>
  );
}
