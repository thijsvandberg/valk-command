"use client";

import { useState } from "react";
import { X, AlertTriangle, Sparkles, RefreshCw, BookOpen, Clock, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { LiveStreamState, AnalysisType } from "@/hooks/useStakeholderAnalysis";

// Re-export from shared lib for backward compatibility
export { parseBriefingOutput } from "@/lib/stakeholder-data";

export interface AiInsightsPanelProps {
  type: AnalysisType;
  live: LiveStreamState;
  narrative: string | null;
  risks: string[];
  content: string | null;
  generatedAt: string | null;
  isStale: boolean;
  onDismiss: () => void;
  onRetry: () => void;
  /** Override the initial collapsed state (defaults to true when a saved result exists) */
  defaultCollapsed?: boolean;
  /** Render as a flat drawer section instead of a card */
  inDrawer?: boolean;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return "1 hour ago";
  if (diffH < 24) return `${diffH} hours ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function renderDeepDiveContent(content: string, inDrawer = false) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let buffer: string[] = [];
  let key = 0;

  const bodyClass = inDrawer
    ? "leading-[1.75] text-text-secondary whitespace-pre-wrap"
    : "text-body-lg leading-relaxed text-text-secondary whitespace-pre-wrap max-w-prose";

  function flushBuffer() {
    if (buffer.length === 0) return;
    const text = buffer.join("\n").trim();
    if (text) {
      elements.push(
        <p key={key++} className={bodyClass} style={inDrawer ? { fontSize: "1rem" } : undefined}>
          {text}
        </p>,
      );
    }
    buffer = [];
  }

  for (const line of lines) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      flushBuffer();
      const level = line.startsWith("### ") ? "###" : "##";
      const text = line.slice(level.length + 1).trim();
      elements.push(
        <p
          key={key++}
          className={
            inDrawer
              ? `font-semibold text-text-primary ${level === "##" ? "mt-6 mb-2" : "mt-4 mb-1"}`
              : `font-semibold text-text-primary ${level === "##" ? "text-body-lg mt-3" : "text-body-sm mt-2"}`
          }
          style={inDrawer ? { fontSize: level === "##" ? "1.0625rem" : "1rem" } : undefined}
        >
          {text}
        </p>,
      );
    } else {
      buffer.push(line);
    }
  }
  flushBuffer();

  return <div className={inDrawer ? "space-y-2" : "space-y-1.5"}>{elements}</div>;
}

export function AiInsightsPanel({
  type,
  live,
  narrative,
  risks,
  content,
  generatedAt,
  isStale,
  onDismiss,
  onRetry,
  defaultCollapsed,
  inDrawer = false,
}: AiInsightsPanelProps) {
  const isRunning = live.status === "submitting" || live.status === "streaming";
  const hasSavedResult = !!(type === "brief" ? narrative : content) && live.status === "idle";
  const hasLiveResult = live.status === "completed";
  const hasFailed = live.status === "failed";
  const isVisible = isRunning || hasSavedResult || hasLiveResult || hasFailed;

  // Default collapsed when a completed result exists unless explicitly overridden
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed ?? hasSavedResult);

  if (!isVisible) return null;

  const label = type === "brief" ? "Status Brief" : "Sprint Insights";
  const Icon = type === "brief" ? Sparkles : BookOpen;

  const displayNarrative = hasLiveResult || hasSavedResult ? narrative : null;
  const displayRisks = hasLiveResult || hasSavedResult ? risks : [];
  const displayContent = hasLiveResult || hasSavedResult ? content : null;
  const hasResult = hasLiveResult || hasSavedResult;

  // Expand automatically when generation completes
  const showBody = !collapsed || isRunning;

  // Drawer variant: flat section, no card chrome, larger body text
  if (inDrawer) {
    return (
      <div role="region" aria-label={`AI-generated ${label}`} aria-busy={isRunning}>
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]/70 shrink-0" />
            <span className="text-body-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-400)]/60">
              AI {label}
            </span>
            {generatedAt && hasResult && (
              <span className="flex items-center gap-1 text-caption text-text-muted truncate">
                <Clock size={9} strokeWidth={1.5} className="shrink-0" />
                {formatRelative(generatedAt)}
              </span>
            )}
            {isStale && hasResult && !isRunning && (
              <span className="shrink-0 rounded-sm bg-[var(--color-status-warning)]/10 px-1 py-px text-caption text-[var(--color-status-warning)]/60">
                data changed
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {isStale && hasResult && !isRunning && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-sm text-[var(--color-status-warning)]/70 bg-[var(--color-status-warning)]/[0.08] border border-[var(--color-status-warning)]/20 cursor-pointer hover:bg-[var(--color-status-warning)]/[0.14] hover:text-[var(--color-status-warning)]/90 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <RotateCcw size={11} strokeWidth={1.5} />
                Re-run
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {isRunning && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-body-sm text-text-tertiary">
              <RefreshCw size={11} strokeWidth={1.5} className="animate-spin shrink-0" />
              <span>{live.progressText || "Generating..."}</span>
            </div>
            <div className="space-y-2 pt-1">
              <div className="h-2.5 w-full animate-pulse rounded-full bg-overlay-default" />
              <div className="h-2.5 w-[88%] animate-pulse rounded-full bg-overlay-subtle" />
              <div className="h-2.5 w-[72%] animate-pulse rounded-full bg-overlay-subtle" />
            </div>
          </div>
        )}

        {!isRunning && type === "brief" && displayNarrative && (
          <div className="space-y-3">
            <p className="leading-[1.75] text-text-secondary" style={{ fontSize: "1rem" }}>
              {displayNarrative}
            </p>
            {displayRisks.length > 0 && (
              <div className="space-y-2 pt-1">
                {displayRisks.map((risk, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertTriangle size={13} strokeWidth={1.5} className="mt-[3px] shrink-0 text-[var(--color-status-warning)]/60" />
                    <p className="text-[var(--color-status-warning)]/60" style={{ fontSize: "1rem" }}>{risk}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isRunning && type === "deep-dive" && displayContent && (
          <div>{renderDeepDiveContent(displayContent, true)}</div>
        )}

        {hasFailed && (
          <div className="flex items-center justify-between gap-3 mt-2">
            <p className="text-body-sm text-[var(--color-status-error)]/70">{live.error ?? "Failed to generate"}</p>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 rounded-md px-2.5 py-1 text-body-sm text-text-tertiary bg-overlay-subtle cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  // Card variant (default)
  return (
    <div
      role="region"
      aria-label={`AI-generated ${label}`}
      aria-busy={isRunning}
      className="relative rounded-xl border border-[var(--color-brand-400)]/20 bg-[var(--color-brand-900)]/30 overflow-hidden"
      style={{
        boxShadow: "0 0 0 1px color-mix(in srgb, #3389d8 6%, transparent), 0 4px 24px -4px color-mix(in srgb, #3389d8 8%, transparent)",
      }}
    >
      {/* Subtle top glow strip */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, color-mix(in srgb, #3389d8 35%, transparent) 40%, color-mix(in srgb, #34d4a5 20%, transparent) 70%, transparent)",
        }}
      />

      <div className="px-4 py-3.5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: icon + label + timestamp */}
          <button
            type="button"
            onClick={() => hasResult && setCollapsed((c) => !c)}
            className={`flex min-w-0 flex-1 items-center gap-2 ${hasResult && !isRunning ? "cursor-pointer" : "cursor-default"}`}
            disabled={!hasResult || isRunning}
          >
            <Icon size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]/70 shrink-0" />
            <span className="text-body-sm font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-400)]/60">
              AI {label}
            </span>
            {generatedAt && hasResult && (
              <span className="flex items-center gap-1 text-caption text-text-muted truncate">
                <Clock size={9} strokeWidth={1.5} className="shrink-0" />
                {formatRelative(generatedAt)}
              </span>
            )}
            {isStale && hasResult && !isRunning && (
              <span className="shrink-0 rounded-sm bg-[var(--color-status-warning)]/10 px-1 py-px text-caption text-[var(--color-status-warning)]/60">
                data changed
              </span>
            )}
          </button>

          {/* Right: re-run, collapse, dismiss */}
          <div className="flex shrink-0 items-center gap-0.5">
            {isStale && hasResult && !isRunning && (
              <button
                type="button"
                onClick={onRetry}
                title="Re-run analysis"
                className="flex items-center gap-1 rounded px-1.5 py-1 text-caption text-[var(--color-status-warning)]/50 cursor-pointer hover:bg-[var(--color-status-warning)]/[0.08] hover:text-[var(--color-status-warning)]/80 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <RotateCcw size={10} strokeWidth={1.5} />
                Re-run
              </button>
            )}
            {hasResult && !isRunning && (
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? `Expand AI ${label}` : `Collapse AI ${label}`}
                className="rounded p-1 text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                {collapsed ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronUp size={12} strokeWidth={1.5} />}
              </button>
            )}
            {!isRunning && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label={`Dismiss AI ${label}`}
                className="rounded p-1 text-text-muted cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* Body — hidden when collapsed */}
        {showBody && (
          <div className="mt-3">
            {/* Loading state */}
            {isRunning && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-body-sm text-text-tertiary">
                  <RefreshCw size={11} strokeWidth={1.5} className="animate-spin shrink-0" />
                  <span>{live.progressText || "Generating..."}</span>
                </div>
                <div className="space-y-2 pt-1">
                  <div className="h-2.5 w-full animate-pulse rounded-full bg-overlay-default" />
                  <div className="h-2.5 w-[88%] animate-pulse rounded-full bg-overlay-subtle" />
                  <div className="h-2.5 w-[72%] animate-pulse rounded-full bg-overlay-subtle" />
                </div>
              </div>
            )}

            {/* Brief: narrative + risks */}
            {!isRunning && type === "brief" && displayNarrative && (
              <div className="space-y-3">
                <p className="text-body-lg leading-relaxed text-text-secondary max-w-prose">{displayNarrative}</p>
                {displayRisks.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {displayRisks.map((risk, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertTriangle size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[var(--color-status-warning)]/60" />
                        <p className="text-body-sm text-[var(--color-status-warning)]/60 max-w-prose">{risk}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Deep Dive: structured long-form content */}
            {!isRunning && type === "deep-dive" && displayContent && (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {renderDeepDiveContent(displayContent)}
              </div>
            )}

            {/* Error state */}
            {hasFailed && (
              <div className="flex items-center justify-between gap-3 mt-2">
                <p className="text-body-sm text-[var(--color-status-error)]/70">{live.error ?? "Failed to generate"}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="shrink-0 rounded-md px-2.5 py-1 text-body-sm text-text-tertiary bg-overlay-subtle cursor-pointer hover:bg-overlay-default hover:text-text-secondary transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
