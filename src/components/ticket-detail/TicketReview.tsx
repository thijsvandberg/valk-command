"use client";

import { useState, useCallback } from "react";
import { mutate as globalMutate } from "swr";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useTicketReviews } from "@/hooks/useSprintBoard";
import { SectionHeader } from "./SectionHeader";
import type { StoredReview } from "@/types/ticket";

function getScoreColor(score: number): string {
  if (score < 30) return "#e5534b";
  if (score < 70) return "#ea8744";
  return "#4aaa60";
}

function statusIcon(score: number): string {
  if (score >= 100) return "\u2713";
  if (score > 0) return "~";
  return "\u2717";
}

function parseRawScore(feedback: string): { raw: string | null; text: string } {
  const pipeIdx = feedback.indexOf("|");
  if (pipeIdx !== -1 && /^\d+\/\d+$/.test(feedback.slice(0, pipeIdx))) {
    return { raw: feedback.slice(0, pipeIdx), text: feedback.slice(pipeIdx + 1) };
  }
  return { raw: null, text: feedback };
}

function DimensionRow({ dim }: { dim: StoredReview["dimensions"][number] }) {
  const color = getScoreColor(dim.score);
  const icon = statusIcon(dim.score);
  const { raw } = parseRawScore(dim.feedback);
  return (
    <div className="grid grid-cols-[16px_1fr_60px_44px] items-center gap-x-2 px-3 py-2">
      <span className="text-center text-xs font-medium" style={{ color }}>{icon}</span>
      <span className="text-xs text-white/50">{dim.label}</span>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${dim.score}%`, backgroundColor: color, opacity: 0.5 }}
        />
      </div>
      <span className="text-right text-xs font-medium tabular-nums" style={{ color }}>
        {raw ?? dim.score}
      </span>
    </div>
  );
}

function parseSuggestion(s: string): {
  criterion: string | null;
  location: string | null;
  score: string | null;
  problem: string;
  suggestion: string | null;
} {
  const metaMatch = s.match(/^\[([^|]*)\|([^|]*)\|([^\]]*)\]\s*/);
  if (metaMatch) {
    const rest = s.slice(metaMatch[0].length);
    const parts = rest.split(" \u2192 ");
    return {
      criterion: metaMatch[1] || null,
      location: metaMatch[2] || null,
      score: metaMatch[3] || null,
      problem: parts[0],
      suggestion: parts[1] ?? null,
    };
  }
  // Fallback for older format [Criterion] problem -> suggestion
  const simpleMatch = s.match(/^\[([^\]]+)\]\s*/);
  const rest = simpleMatch ? s.slice(simpleMatch[0].length) : s;
  const parts = rest.split(" \u2192 ");
  return {
    criterion: simpleMatch ? simpleMatch[1] : null,
    location: null,
    score: null,
    problem: parts[0],
    suggestion: parts[1] ?? null,
  };
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

function verdictLabel(score: number): { text: string; color: string } {
  if (score >= 90) return { text: "Ready for sprint", color: "#4aaa60" };
  if (score >= 75) return { text: "Minor issues", color: "#eab308" };
  if (score >= 60) return { text: "Needs work", color: "#ea8744" };
  return { text: "Not ready", color: "#e5534b" };
}

function ReviewDetail({
  review,
  currentVersionHash,
}: {
  review: StoredReview;
  currentVersionHash: string | null;
}) {
  const verdict = verdictLabel(review.overallScore);
  const failedDimensions = review.dimensions.filter((d) => d.score < 100);

  return (
    <div className="space-y-5">
      {/* Score header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tabular-nums" style={{ color: verdict.color }}>
            {review.overallScore}
          </span>
          <div>
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${verdict.color}15`, color: verdict.color }}
            >
              {verdict.text}
            </span>
          </div>
        </div>
        <div className="text-right">
          <VersionFreshnessLabel review={review} currentVersionHash={currentVersionHash} />
          <div className="mt-0.5 text-[10px] text-white/20">
            {new Date(review.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Criteria breakdown */}
      <div className="rounded-md border border-white/[0.04] divide-y divide-white/[0.04]">
        {review.dimensions.map((dim) => (
          <DimensionRow key={dim.key} dim={dim} />
        ))}
      </div>

      {/* Summary */}
      {review.summary && (
        <p className="text-xs leading-relaxed text-white/45">{review.summary}</p>
      )}

      {/* Issues / Suggestions */}
      {review.suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/25">
            Issues ({review.suggestions.length})
          </p>
          <div className="space-y-2">
            {review.suggestions.map((s, i) => {
              const parsed = parseSuggestion(s);
              return (
                <div key={i} className="rounded-md border border-white/[0.04] bg-white/[0.015] px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    {parsed.criterion && (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/20">{parsed.criterion}</span>
                    )}
                    {parsed.score && (
                      <span className="text-[10px] tabular-nums text-white/15">{parsed.score}</span>
                    )}
                    {parsed.location && (
                      <span className="text-[10px] text-white/25">{parsed.location}</span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-white/50">{parsed.problem}</p>
                  {parsed.suggestion && (
                    <p className="mt-1.5 text-xs leading-relaxed text-white/30">
                      <span className="text-white/20">Suggestion: </span>{parsed.suggestion}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  const { data, saveReview, deleteReview, mutate: mutateReviews } = useTicketReviews(ticketKey);
  const reviews = data?.reviews ?? [];
  const currentVersionHash = data?.currentVersionHash ?? null;
  const latestReview = reviews[0] ?? null;
  const olderReviews = reviews.slice(1);

  const [agentReviewing, setAgentReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function handleAgentReview() {
    setAgentReviewing(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/reviews/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "ticket-detail" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setReviewError(err.error ?? `Review failed (${res.status})`);
      } else {
        mutateReviews();
        // Revalidate ticket data so sidebar quality score updates
        globalMutate(`/api/tickets/${encodeURIComponent(ticketKey)}`);
        globalMutate((key) => typeof key === "string" && key.startsWith("/api/tickets?"), undefined, { revalidate: true });
      }
    } catch {
      setReviewError("Failed to connect to agent");
    } finally {
      setAgentReviewing(false);
    }
  }

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
          {reviewError && (
            <p className="mt-2 text-xs text-[#e5534b]/70">{reviewError}</p>
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
            {reviewError && (
              <p className="mt-2 text-xs text-[#e5534b]/70">{reviewError}</p>
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
