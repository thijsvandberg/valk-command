"use client";

import { useState, useCallback } from "react";
// useSWRConfig, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for provider-backed keys (BRDG-458).
import { useSWRConfig } from "swr";
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useTicketReviews } from "@/hooks/useSprintBoard";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { tickets, ApiError } from "@/lib/api-client";
import { streamTaskAsPromise } from "@/hooks/useTaskStream";
import { getScoreColor, verdictLabel as getVerdictLabel } from "@/lib/status-colors";
import type { StoredReview } from "@/types/ticket";

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
      <span className="text-center text-body-sm font-medium" style={{ color }}>{icon}</span>
      <span className="text-body-sm text-text-secondary">{dim.label}</span>
      <div className="h-1 rounded-full bg-overlay-default overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${dim.score}%`, backgroundColor: color, opacity: 0.5 }}
        />
      </div>
      <span className="text-right text-body-sm font-medium tabular-nums" style={{ color }}>
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
      <span className="inline-flex items-center gap-1 text-caption" style={{ color: "var(--color-status-success)" }}>
        <CheckCircle2 size={10} strokeWidth={1.5} />
        Based on v{review.storyVersionNumber} (current)
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-caption" style={{ color: "var(--color-status-warning)" }}>
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
  const verdict = getVerdictLabel(review.overallScore);
  const failedDimensions = review.dimensions.filter((d) => d.score < 100);

  return (
    <div className="space-y-5">
      {/* Score header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-heading-lg font-semibold tabular-nums" style={{ color: verdict.color }}>
            {review.overallScore}
          </span>
          <div>
            <span
              className="inline-block rounded-full px-2 py-0.5 text-caption font-medium"
              style={{ backgroundColor: `${verdict.color}15`, color: verdict.color }}
            >
              {verdict.text}
            </span>
          </div>
        </div>
        <div className="text-right">
          <VersionFreshnessLabel review={review} currentVersionHash={currentVersionHash} />
          <div className="mt-0.5 text-caption text-text-muted">
            {new Date(review.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Criteria breakdown */}
      <div className="rounded-md border border-border-subtle divide-y divide-border-subtle">
        {review.dimensions.map((dim) => (
          <DimensionRow key={dim.key} dim={dim} />
        ))}
      </div>

      {/* Summary */}
      {review.summary && (
        <div className="rounded-lg bg-overlay-subtle px-4 py-3">
          <p className="text-body-lg leading-relaxed text-text-secondary">{review.summary}</p>
        </div>
      )}

      {/* Issues / Suggestions */}
      {review.suggestions.length > 0 && (
        <div>
          <p className="mb-3 text-label font-medium uppercase tracking-wider text-text-muted">
            Issues ({review.suggestions.length})
          </p>
          <div className="space-y-3">
            {review.suggestions.map((s, i) => {
              const parsed = parseSuggestion(s);
              return (
                <div key={i} className="rounded-lg border border-border-subtle bg-overlay-subtle px-4 py-3">
                  {/* Issue header: criterion, score, location */}
                  <div className="flex items-center gap-2 mb-2">
                    {parsed.criterion && (
                      <span className="text-label font-medium uppercase tracking-wider text-text-muted">{parsed.criterion}</span>
                    )}
                    {parsed.score && (
                      <span className="rounded bg-overlay-default px-1.5 py-0.5 text-caption tabular-nums text-text-tertiary">{parsed.score}</span>
                    )}
                    {parsed.location && (
                      <span className="rounded bg-overlay-default px-1.5 py-0.5 text-caption text-text-tertiary">{parsed.location}</span>
                    )}
                  </div>

                  {/* Problem */}
                  <p className="text-body-lg leading-relaxed text-text-secondary">{parsed.problem}</p>

                  {/* Suggestion */}
                  {parsed.suggestion && (
                    <div className="mt-3 flex gap-2 rounded-md bg-[var(--color-brand-500)]/[0.04] px-3 py-2">
                      <span className="shrink-0 text-body-sm font-medium text-[var(--color-brand-400)]/50 mt-px">Suggestion</span>
                      <p className="text-body-lg leading-relaxed text-text-secondary">{parsed.suggestion}</p>
                    </div>
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
    <div className="rounded-lg border border-border-default bg-overlay-subtle">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
      >
        <div className="flex items-center gap-2 text-body-sm text-text-tertiary">
          <span className="font-medium text-text-secondary capitalize">{review.source.replace("-", " ")}</span>
          <span>{new Date(review.createdAt).toLocaleDateString()}</span>
          <VersionFreshnessLabel review={review} currentVersionHash={currentVersionHash} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-body-lg font-semibold tabular-nums" style={{ color: getScoreColor(review.overallScore) }}>
            {review.overallScore}
          </span>
          {expanded ? (
            <ChevronUp size={14} className="text-text-muted" strokeWidth={1.5} />
          ) : (
            <ChevronDown size={14} className="text-text-muted" strokeWidth={1.5} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-4">
          <ReviewDetail review={review} currentVersionHash={currentVersionHash} />
          <div className="flex justify-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(review.id);
              }}
              icon={<Trash2 size={11} strokeWidth={1.5} />}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


export function TicketReview({ ticketKey }: { ticketKey: string }) {
  const { mutate: swrMutate } = useSWRConfig();
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
      const result = await tickets.generateReview(ticketKey, { source: "ticket-detail" }) as { taskId?: string };
      const taskId = result?.taskId;

      if (!taskId) {
        throw new Error("No task ID returned from review generation");
      }

      await streamTaskAsPromise(taskId);

      mutateReviews();
      // Revalidate ticket data so sidebar quality score updates
      void swrMutate(`/api/tickets/${encodeURIComponent(ticketKey)}`);
      void swrMutate((key) => typeof key === "string" && key.startsWith("/api/tickets?"), undefined, { revalidate: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setReviewError(err.body?.error ?? `Review failed (${err.status})`);
      } else {
        setReviewError(err instanceof Error ? err.message : "Failed to connect to agent");
      }
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
          <div className="mt-3 rounded-lg border border-border-default bg-overlay-subtle p-4">
            <ReviewDetail review={latestReview} currentVersionHash={currentVersionHash} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={handleAgentReview}
              disabled={agentReviewing}
              icon={agentReviewing
                ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                : <Sparkles size={14} strokeWidth={1.2} />
              }
            >
              {agentReviewing ? "Reviewing..." : "Re-review"}
            </Button>
            <Button
              variant="destructive"
              size="md"
              onClick={() => setDeleteTarget(latestReview.id)}
              icon={<Trash2 size={12} strokeWidth={1.5} />}
            >
              Delete
            </Button>
          </div>
          {reviewError && (
            <p className="mt-2 text-body-sm text-[var(--color-status-error)]/70">{reviewError}</p>
          )}
        </div>
      ) : (
        <div>
          <SectionHeader title="Review" />
          <div className="mt-3">
            <p className="mb-3 text-body-lg text-text-muted">No review yet</p>
            <Button
              variant="secondary"
              size="md"
              onClick={handleAgentReview}
              disabled={agentReviewing}
              icon={agentReviewing
                ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                : <Sparkles size={14} strokeWidth={1.2} />
              }
            >
              {agentReviewing ? "Reviewing..." : "Review Story via Agent"}
            </Button>
            {reviewError && (
              <p className="mt-2 text-body-sm text-[var(--color-status-error)]/70">{reviewError}</p>
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
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete review?"
        description="This will permanently remove this review from the history. The quality score will update to reflect the most recent remaining review."
        confirmLabel="Delete"
        confirmClassName="!bg-[var(--color-status-error)] !text-white hover:!bg-[var(--color-status-error-hover)]"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
