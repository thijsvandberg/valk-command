"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { useTicketReviews } from "@/hooks/useSprintBoard";
import { SectionHeader } from "./SectionHeader";
import type { StoredReview } from "@/types/ticket";

function getScoreColor(score: number): string {
  if (score < 30) return "#e5534b";
  if (score < 70) return "#ea8744";
  return "#4aaa60";
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  const color = getScoreColor(score);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-white/50">{label}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${score}%`, backgroundColor: color, opacity: 0.4 }}
        />
      </div>
    </div>
  );
}

function VersionFreshnessLabel({
  review,
  currentVersionHash,
}: {
  review: StoredReview;
  currentVersionHash: string | null;
}) {
  if (!currentVersionHash) return null;

  const isCurrent = review.storyVersionHash === currentVersionHash;

  if (isCurrent) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-[#4aaa60]">
        <CheckCircle2 size={10} strokeWidth={1.5} />
        Based on v{review.storyVersionNumber} (current)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[#ea8744]">
      <AlertTriangle size={10} strokeWidth={1.5} />
      Based on v{review.storyVersionNumber} (outdated)
    </span>
  );
}

function ReviewDetail({
  review,
  currentVersionHash,
}: {
  review: StoredReview;
  currentVersionHash: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Overall score */}
      <div className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2">
        <span className="text-xs text-white/50">Overall Score</span>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: getScoreColor(review.overallScore) }}
          />
          <span className="text-base font-semibold tabular-nums" style={{ color: getScoreColor(review.overallScore) }}>
            {review.overallScore}
          </span>
          <span className="text-[10px] text-white/20">/100</span>
        </div>
      </div>

      {/* Dimension bars */}
      <div className="space-y-3">
        {review.dimensions.map((dim) => (
          <DimensionBar key={dim.key} label={dim.label} score={dim.score} />
        ))}
      </div>

      {/* Summary */}
      {review.summary && (
        <p className="text-sm text-white/60">{review.summary}</p>
      )}

      {/* Suggestions */}
      {review.suggestions.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/25">Suggestions</p>
          <ul className="space-y-1">
            {review.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-white/50">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/20" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Meta */}
      <div className="flex items-center gap-2 text-[10px] text-white/25">
        <span>{new Date(review.createdAt).toLocaleString()}</span>
        <span>via {review.source.replace("-", " ")}</span>
        <VersionFreshnessLabel review={review} currentVersionHash={currentVersionHash} />
      </div>
    </div>
  );
}

function ReviewHistoryItem({
  review,
  currentVersionHash,
  onDelete,
}: {
  review: StoredReview;
  currentVersionHash: string | null;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="font-medium text-white/60 capitalize">{review.source.replace("-", " ")}</span>
          <span>{new Date(review.createdAt).toLocaleDateString()}</span>
          <VersionFreshnessLabel review={review} currentVersionHash={currentVersionHash} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums" style={{ color: getScoreColor(review.overallScore) }}>
            {review.overallScore}
          </span>
          {expanded ? (
            <ChevronUp size={14} className="text-white/25" strokeWidth={1.5} />
          ) : (
            <ChevronDown size={14} className="text-white/25" strokeWidth={1.5} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.04] px-4 py-3 space-y-4">
          <ReviewDetail review={review} currentVersionHash={currentVersionHash} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(review.id);
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[#e5534b]/60 cursor-pointer hover:bg-[#e5534b]/10 hover:text-[#e5534b] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#e5534b] active:scale-[0.97]"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
            >
              <Trash2 size={11} strokeWidth={1.5} />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeleteConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
        <h3 className="text-sm font-medium text-white/80">Delete review?</h3>
        <p className="mt-2 text-xs text-white/40">
          This will permanently remove this review from the history. The quality score will update to reflect the most recent remaining review.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white/50 cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
            style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-[#e5534b] px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[#d04840] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5534b] active:scale-[0.98]"
            style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function TicketReview({ ticketKey }: { ticketKey: string }) {
  const { data, saveReview, deleteReview } = useTicketReviews(ticketKey);
  const reviews = data?.reviews ?? [];
  const currentVersionHash = data?.currentVersionHash ?? null;
  const latestReview = reviews[0] ?? null;
  const olderReviews = reviews.slice(1);

  const workspaceTask = useWorkspaceTask();
  const agentReviewing = workspaceTask.status === "submitting" || workspaceTask.status === "streaming";
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  function handleAgentReview() {
    workspaceTask.reset();
    workspaceTask.submitAndStream("review-story-json", { args: ticketKey });
  }

  // Persist review when workspace task completes
  const savedTaskRef = useRef<string | null>(null);
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

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteReview(deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, deleteReview, setDeleteTarget]);

  return (
    <div className="mt-6 space-y-8">
      {/* Latest review (always shown expanded if exists) */}
      {latestReview ? (
        <div>
          <SectionHeader title="Latest Review" />
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <ReviewDetail review={latestReview} currentVersionHash={currentVersionHash} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleAgentReview}
              disabled={agentReviewing}
              className="flex items-center gap-2 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-4 py-2 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
            >
              {agentReviewing ? (
                <>
                  <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  Reviewing...
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={1.2} />
                  Re-review
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(latestReview.id)}
              className="flex items-center gap-1 rounded-md px-3 py-2 text-xs text-[#e5534b]/60 cursor-pointer hover:bg-[#e5534b]/10 hover:text-[#e5534b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5534b] active:scale-[0.98]"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
            >
              <Trash2 size={12} strokeWidth={1.5} />
              Delete
            </button>
          </div>
          {agentReviewing && workspaceTask.progressText && (
            <p className="mt-2 text-xs text-white/30">{workspaceTask.progressText}</p>
          )}
          {workspaceTask.status === "failed" && (
            <p className="mt-2 text-xs text-[#e5534b]/70">{workspaceTask.error ?? "Review failed"}</p>
          )}
        </div>
      ) : (
        <div>
          <SectionHeader title="Review" />
          <div className="mt-3">
            <p className="mb-3 text-sm text-white/25">No review yet</p>
            <button
              type="button"
              onClick={handleAgentReview}
              disabled={agentReviewing}
              className="flex items-center gap-2 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-4 py-2 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.10] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
            >
              {agentReviewing ? (
                <>
                  <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                  Reviewing...
                </>
              ) : (
                <>
                  <Sparkles size={14} strokeWidth={1.2} />
                  Review Story via Agent
                </>
              )}
            </button>
            {agentReviewing && workspaceTask.progressText && (
              <p className="mt-2 text-xs text-white/30">{workspaceTask.progressText}</p>
            )}
            {workspaceTask.status === "failed" && (
              <p className="mt-2 text-xs text-[#e5534b]/70">{workspaceTask.error ?? "Review failed"}</p>
            )}
          </div>
        </div>
      )}

      {/* Older reviews (collapsible) */}
      {olderReviews.length > 0 && (
        <div>
          <SectionHeader title="Previous Reviews" count={olderReviews.length} />
          <div className="mt-3 space-y-2">
            {olderReviews.map((review) => (
              <ReviewHistoryItem
                key={review.id}
                review={review}
                currentVersionHash={currentVersionHash}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
