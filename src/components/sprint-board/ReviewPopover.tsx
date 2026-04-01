"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw, Sparkles, X } from "lucide-react";
import { useTicketReviews } from "@/hooks/useSprintBoard";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import type { StoredReview } from "@/types/ticket";

function getScoreColor(score: number): string {
  if (score < 30) return "#e5534b";
  if (score < 70) return "#ea8744";
  return "#4aaa60";
}

function DimensionRow({ dim }: { dim: StoredReview["dimensions"][number] }) {
  const color = getScoreColor(dim.score);
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-white/50">{dim.label}</span>
      <div className="flex items-center gap-2">
        <div className="h-1 w-16 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${dim.score}%`, backgroundColor: color, opacity: 0.6 }}
          />
        </div>
        <span className="w-7 text-right text-xs font-medium tabular-nums" style={{ color }}>
          {dim.score}
        </span>
      </div>
    </div>
  );
}

function FreshnessIndicator({
  review,
  currentVersionHash,
  onReReview,
  reviewing,
}: {
  review: StoredReview;
  currentVersionHash: string | null;
  onReReview: () => void;
  reviewing: boolean;
}) {
  if (!currentVersionHash) return null;

  const isCurrent = review.storyVersionHash === currentVersionHash;

  if (isCurrent) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-[#4aaa60]/80">
        <CheckCircle2 size={12} strokeWidth={1.5} />
        <span>Based on v{review.storyVersionNumber} (current)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[11px] text-[#ea8744]/80">
        <AlertTriangle size={12} strokeWidth={1.5} />
        <span>Based on v{review.storyVersionNumber} (outdated)</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReReview();
        }}
        disabled={reviewing}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
      >
        <RefreshCw size={10} strokeWidth={1.5} className={reviewing ? "animate-spin" : ""} />
        Re-review
      </button>
    </div>
  );
}

export function ReviewPopover({
  ticketKey,
  score,
  onClose,
}: {
  ticketKey: string;
  score: number | null;
  onClose: () => void;
}) {
  const { data, saveReview } = useTicketReviews(ticketKey);
  const reviews = data?.reviews ?? [];
  const currentVersionHash = data?.currentVersionHash ?? null;
  const latestReview = reviews[0] ?? null;
  const workspaceTask = useWorkspaceTask();
  const reviewing = workspaceTask.status === "submitting" || workspaceTask.status === "streaming";
  const popoverRef = useRef<HTMLDivElement>(null);
  const savedTaskRef = useRef<string | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleRunReview = useCallback(() => {
    workspaceTask.reset();
    workspaceTask.submitAndStream("review-story-json", { args: ticketKey });
  }, [ticketKey, workspaceTask]);

  // Persist when workspace task completes
  useEffect(() => {
    if (
      workspaceTask.status !== "completed" ||
      !workspaceTask.output ||
      !workspaceTask.taskId ||
      savedTaskRef.current === workspaceTask.taskId
    ) return;

    savedTaskRef.current = workspaceTask.taskId;

    const agentData = parseReviewOutput(workspaceTask.output);
    if (agentData) {
      const result = mapAgentReviewToResult(agentData);
      saveReview({
        source: "ticket-detail",
        overallScore: result.overallScore,
        dimensions: result.dimensions,
        summary: result.summary,
        suggestions: result.suggestions,
      });
    }
  }, [workspaceTask.status, workspaceTask.output, workspaceTask.taskId, saveReview]);

  const color = score !== null ? getScoreColor(score) : undefined;

  return (
    <div
      ref={popoverRef}
      className="absolute top-full left-1/2 z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Arrow */}
      <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-white/[0.08] bg-[var(--color-surface-floating)]" />

      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-white/40">Quality Review</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
          >
            <X size={12} strokeWidth={1.5} className="text-white/30" />
          </button>
        </div>

        {latestReview ? (
          <>
            {/* Overall score */}
            <div className="flex items-center justify-between mb-3 rounded-md bg-white/[0.03] px-3 py-2">
              <span className="text-xs text-white/50">Overall</span>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-base font-semibold tabular-nums" style={{ color }}>
                  {latestReview.overallScore}
                </span>
                <span className="text-[10px] text-white/20">/100</span>
              </div>
            </div>

            {/* Dimensions */}
            <div className="mb-3 space-y-0.5">
              {latestReview.dimensions.map((dim) => (
                <DimensionRow key={dim.key} dim={dim} />
              ))}
            </div>

            {/* Summary */}
            {latestReview.summary && (
              <p className="mb-3 text-[11px] leading-relaxed text-white/35 line-clamp-3">
                {latestReview.summary}
              </p>
            )}

            {/* Suggestions */}
            {latestReview.suggestions.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/20">Suggestions</p>
                <ul className="space-y-0.5">
                  {latestReview.suggestions.slice(0, 3).map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-white/35">
                      <span className="mt-1.5 h-0.5 w-0.5 shrink-0 rounded-full bg-white/20" />
                      <span className="line-clamp-1">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timestamp + freshness */}
            <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
              <div className="text-[10px] text-white/25">
                {new Date(latestReview.createdAt).toLocaleString()} via {latestReview.source.replace("-", " ")}
              </div>
              <FreshnessIndicator
                review={latestReview}
                currentVersionHash={currentVersionHash}
                onReReview={handleRunReview}
                reviewing={reviewing}
              />
            </div>

            {/* History count */}
            {reviews.length > 1 && (
              <div className="mt-2 text-[10px] text-white/20">
                {reviews.length} reviews total
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center py-4">
            <p className="mb-3 text-xs text-white/30">No review yet</p>
            <button
              type="button"
              onClick={handleRunReview}
              disabled={reviewing}
              className="flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
            >
              {reviewing ? (
                <>
                  <RefreshCw size={12} strokeWidth={1.5} className="animate-spin" />
                  Reviewing...
                </>
              ) : (
                <>
                  <Sparkles size={12} strokeWidth={1.2} />
                  Run Review
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
