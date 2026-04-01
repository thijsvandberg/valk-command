"use client";

import { useState, useCallback } from "react";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { reviewStory, type ReviewResult } from "@/lib/agent-client";
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

export function TicketReview({ ticketKey }: { ticketKey: string }) {
  const { data, saveReview } = useTicketReviews(ticketKey);
  const reviews = data?.reviews ?? [];
  const currentVersionHash = data?.currentVersionHash ?? null;

  const [agentReviewing, setAgentReviewing] = useState(false);
  const [agentResult, setAgentResult] = useState<ReviewResult | null>(null);

  const handleAgentReview = useCallback(async () => {
    setAgentReviewing(true);
    setAgentResult(null);
    try {
      const result = await reviewStory(ticketKey);
      setAgentResult(result);

      await saveReview({
        source: "ticket-detail",
        overallScore: result.overallScore,
        dimensions: result.dimensions,
        summary: result.summary,
        suggestions: result.suggestions,
      });
    } catch (err) {
      console.error("Operation failed:", err);
    } finally {
      setAgentReviewing(false);
    }
  }, [ticketKey, saveReview]);

  return (
    <div className="mt-6 space-y-8">
      {/* Agent review */}
      <div>
        <SectionHeader title="Agent Review" />
        <div className="mt-3">
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

          {agentResult && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
              {/* Overall score */}
              <div className="flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2">
                <span className="text-xs text-white/50">Overall Score</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: getScoreColor(agentResult.overallScore) }}
                  />
                  <span className="text-base font-semibold tabular-nums" style={{ color: getScoreColor(agentResult.overallScore) }}>
                    {agentResult.overallScore}
                  </span>
                  <span className="text-[10px] text-white/20">/100</span>
                </div>
              </div>

              {/* Dimension bars */}
              <div className="space-y-3">
                {agentResult.dimensions.map((dim) => (
                  <DimensionBar key={dim.key} label={dim.label} score={dim.score} />
                ))}
              </div>

              {/* Summary */}
              <p className="text-sm text-white/60">{agentResult.summary}</p>

              {/* Suggestions */}
              {agentResult.suggestions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/25">Suggestions</p>
                  <ul className="space-y-1">
                    {agentResult.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/50">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/20" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Review history */}
      <div>
        <SectionHeader title="Review History" count={reviews.length} />
        <div className="mt-3 space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span className="font-medium text-white/60 capitalize">{review.source.replace("-", " ")}</span>
                  <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                  <VersionFreshnessLabel review={review} currentVersionHash={currentVersionHash} />
                </div>
                <span className="text-sm font-semibold tabular-nums" style={{ color: getScoreColor(review.overallScore) }}>
                  {review.overallScore}
                </span>
              </div>
              <div className="mt-2 flex gap-3">
                {review.dimensions.map((dim) => (
                  <div key={dim.key} className="flex items-center gap-1.5 text-[10px] text-white/30">
                    <span>{dim.label}:</span>
                    <span className="font-medium tabular-nums" style={{ color: getScoreColor(dim.score) }}>{dim.score}</span>
                  </div>
                ))}
              </div>
              {review.summary && (
                <p className="mt-2 text-xs text-white/35 line-clamp-2">{review.summary}</p>
              )}
            </div>
          ))}
          {reviews.length === 0 && <p className="text-sm text-white/25">No reviews yet</p>}
        </div>
      </div>
    </div>
  );
}
