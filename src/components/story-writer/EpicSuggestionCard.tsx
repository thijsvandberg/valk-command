"use client";

import { useState, useEffect } from "react";
import { Target, Check } from "lucide-react";
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

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "var(--color-status-success-subtle)", text: "var(--color-status-success)", label: "High" },
  medium: { bg: "var(--color-status-caution-subtle)", text: "var(--color-status-caution)", label: "Med" },
  low: { bg: "rgba(155, 108, 212, 0.10)", text: "var(--color-icon-epic)", label: "Low" },
};

interface ResolvedInfo {
  status: string;
  readiness: TicketReadiness | null;
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
      icon={<Target size={10} strokeWidth={1.5} className="text-text-muted" />}
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

        return (
          <SuggestionRow key={s.key} active={isSelected}>
            <TicketStatusPill
              ticketKey={s.key}
              issueType="epic"
              jiraStatus={(info?.status ?? "TO DO") as JiraStatus}
              readiness={info?.readiness ?? undefined}
              title={s.name}
              size="sm"
              variant="list"
              compact
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className={`min-w-0 flex-1 truncate text-label ${isSelected ? "text-text-primary" : "text-text-secondary"}`}>
                  {s.name}
                </span>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 text-caption font-medium leading-none"
                  style={{ backgroundColor: conf.bg, color: conf.text }}
                >
                  {conf.label}
                </span>
              </div>
              <span className="text-caption text-text-muted leading-[1.4] truncate">
                {s.reason}
              </span>
            </div>
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
          </SuggestionRow>
        );
      })}
    </SuggestionCard>
  );
}
