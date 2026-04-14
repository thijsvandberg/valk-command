"use client";

import { X, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import type { TaskStreamStatus } from "@/hooks/useWorkspaceTask";

export interface AiInsightsPanelProps {
  status: TaskStreamStatus;
  progressText: string;
  narrative: string | null;
  risks: string[];
  error: string | null;
  onDismiss: () => void;
  onRetry: () => void;
}

export function parseBriefingOutput(output: string): { narrative: string; risks: string[] } {
  const jsonMatch = output.match(/<json-output>([\s\S]*?)<\/json-output>/);
  if (jsonMatch) {
    const narrative = output.slice(0, output.indexOf("<json-output>")).trim();
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const risks = Array.isArray(parsed.risks) ? (parsed.risks as string[]) : [];
      return { narrative, risks };
    } catch {
      return { narrative, risks: [] };
    }
  }
  return { narrative: output.trim(), risks: [] };
}

export function AiInsightsPanel({
  status,
  progressText,
  narrative,
  risks,
  error,
  onDismiss,
  onRetry,
}: AiInsightsPanelProps) {
  if (status === "idle") return null;

  return (
    <div
      role="region"
      aria-label="AI-generated sprint insights"
      aria-busy={status === "submitting" || status === "streaming"}
      className="relative rounded-xl border border-[var(--color-brand-400)]/20 bg-[var(--color-brand-900)]/30 overflow-hidden"
      style={{
        boxShadow: "0 0 0 1px rgba(51,137,216,0.06), 0 4px 24px -4px rgba(51,137,216,0.08)",
      }}
    >
      {/* Subtle top glow strip */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(51,137,216,0.35) 40%, rgba(52,212,165,0.2) 70%, transparent)",
        }}
      />

      <div className="px-4 py-4">
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles
              size={13}
              strokeWidth={1.5}
              className="text-[var(--color-brand-400)]/70 shrink-0"
            />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-400)]/60">
              AI Insights
            </span>
          </div>
          {(status === "completed" || status === "failed") && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss AI insights"
              className="rounded p-1 text-white/20 cursor-pointer hover:bg-white/[0.05] hover:text-white/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>

        {/* Loading state */}
        {(status === "submitting" || status === "streaming") && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs text-white/30">
              <RefreshCw size={11} strokeWidth={1.5} className="animate-spin shrink-0" />
              <span>{progressText || "Generating insights..."}</span>
            </div>
            <div className="space-y-2 pt-1">
              <div className="h-2.5 w-full animate-pulse rounded-full bg-white/[0.05]" />
              <div className="h-2.5 w-[88%] animate-pulse rounded-full bg-white/[0.04]" />
              <div className="h-2.5 w-[72%] animate-pulse rounded-full bg-white/[0.03]" />
            </div>
          </div>
        )}

        {/* Completed state: narrative + risks */}
        {status === "completed" && narrative && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-white/70">{narrative}</p>
            {risks.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {risks.map((risk, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle
                      size={12}
                      strokeWidth={1.5}
                      className="mt-0.5 shrink-0 text-amber-400/60"
                    />
                    <p className="text-xs text-amber-400/60">{risk}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {status === "failed" && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-red-400/70">{error ?? "Failed to generate insights"}</p>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded-md px-2.5 py-1 text-xs text-white/40 bg-white/[0.04] cursor-pointer hover:bg-white/[0.07] hover:text-white/70 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
