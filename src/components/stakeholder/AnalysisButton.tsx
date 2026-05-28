"use client";

import { RefreshCw, Sparkles, BookOpen, Check } from "lucide-react";
import type { AnalysisType } from "@/hooks/useStakeholderAnalysis";

export function AnalysisButton({
  type,
  label,
  isRunning,
  hasResult,
  isStale,
  onClick,
  disabled,
}: {
  type: AnalysisType;
  label: string;
  isRunning: boolean;
  hasResult: boolean;
  isStale: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = type === "brief" ? Sparkles : BookOpen;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Generate ${label} for this sprint`}
      className="relative flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150 cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      {isRunning ? (
        <RefreshCw size={12} strokeWidth={1.5} className="animate-spin" />
      ) : (
        <Icon size={12} strokeWidth={1.5} />
      )}
      {label}
      {hasResult && !isRunning && (
        <span
          className={`ml-0.5 h-1.5 w-1.5 rounded-full ${isStale ? "bg-amber-400/60" : "bg-emerald-400/60"}`}
          title={isStale ? "Data changed since last analysis" : "Analysis up to date"}
        />
      )}
      {hasResult && !isRunning && !isStale && (
        <Check size={9} strokeWidth={2} className="text-emerald-400/60" />
      )}
    </button>
  );
}
