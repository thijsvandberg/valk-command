"use client";

import { useState, useRef, useEffect } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useTicketReviews } from "@/hooks/useSprintBoard";
import type { StoredReview } from "@/types/ticket";
import { tickets as ticketsApi } from "@/lib/api-client";

function getScoreColor(score: number): string {
  if (score < 60) return "#e5534b";
  if (score < 75) return "#ea8744";
  if (score < 90) return "#eab308";
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
      <div className="flex items-center gap-1.5 text-label text-[#4aaa60]/80">
        <CheckCircle2 size={12} strokeWidth={1.5} />
        <span>Based on v{review.storyVersionNumber} (current)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-label text-[#ea8744]/80">
        <AlertTriangle size={12} strokeWidth={1.5} />
        <span>Based on v{review.storyVersionNumber} (outdated)</span>
      </div>
      <Button
        variant="secondary"
        size="sm"
        icon={<RefreshCw size={10} strokeWidth={1.5} className={reviewing ? "animate-spin" : ""} />}
        onClick={(e) => {
          e.stopPropagation();
          onReReview();
        }}
        disabled={reviewing}
      >
        Re-review
      </Button>
    </div>
  );
}

export function ReviewPopover({
  ticketKey,
  score,
  onClose,
  anchorRef,
}: {
  ticketKey: string;
  score: number | null;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const { data, mutate: mutateReviews } = useTicketReviews(ticketKey);
  const reviews = data?.reviews ?? [];
  const currentVersionHash = data?.currentVersionHash ?? null;
  const latestReview = reviews[0] ?? null;
  const [reviewing, setReviewing] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position fixed relative to anchor button, clamped to viewport
  const popoverMaxWidth = 384; // w-96
  const gap = 8;
  const margin = 12;
  const [pos, setPos] = useState<{ top: number | undefined; bottom: number | undefined; left: number; width: number }>({
    top: 0, bottom: undefined, left: 0, width: popoverMaxWidth,
  });
  useEffect(() => {
    function updatePos() {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;

      // Horizontal
      const effectiveWidth = Math.min(popoverMaxWidth, vw - margin * 2);
      const anchorCenter = rect.left + rect.width / 2;
      const idealLeft = anchorCenter - effectiveWidth / 2;
      const clampedLeft = Math.min(Math.max(margin, idealLeft), vw - effectiveWidth - margin);

      // Vertical: flip above anchor if not enough space below
      const spaceBelow = vh - rect.bottom - gap;
      const maxPopoverHeight = vh * 0.7; // matches max-h-[70vh]
      const showAbove = spaceBelow < Math.min(maxPopoverHeight, 300) && rect.top > spaceBelow;

      setPos({
        top: showAbove ? undefined : rect.bottom + gap,
        bottom: showAbove ? vh - rect.top + gap : undefined,
        left: clampedLeft,
        width: effectiveWidth,
      });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [anchorRef]);

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

  async function handleRunReview() {
    setReviewing(true);
    try {
      const result = await ticketsApi.generateReview(ticketKey, { source: "ticket-detail" }) as { taskId?: string };
      const taskId = result?.taskId;
      if (taskId) {
        await new Promise<void>((resolve) => {
          const es = new EventSource(`/api/workspace-tasks/${taskId}/stream`);
          const timeout = setTimeout(() => { es.close(); resolve(); }, 5 * 60 * 1000);
          es.addEventListener("result", () => { clearTimeout(timeout); es.close(); resolve(); });
          es.addEventListener("done", () => { clearTimeout(timeout); es.close(); resolve(); });
          es.addEventListener("error", () => { clearTimeout(timeout); es.close(); resolve(); });
        });
      }
      mutateReviews();
    } catch {
      // Silently fail in popover context
    } finally {
      setReviewing(false);
    }
  }

  const color = score !== null ? getScoreColor(score) : undefined;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 max-w-96 max-h-[70vh] overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-floating)] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.03)]"
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
      onClick={(e) => e.stopPropagation()}
    >

      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-white/40">Quality Review</span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={12} strokeWidth={1.5} className="text-white/30" />}
            onClick={onClose}
          />
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
                <span className="text-caption text-white/20">/100</span>
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
              <p className="mb-3 text-label leading-relaxed text-white/35 line-clamp-3">
                {latestReview.summary}
              </p>
            )}

            {/* Suggestions */}
            {latestReview.suggestions.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-caption font-medium uppercase tracking-wider text-white/20">Suggestions</p>
                <ul className="space-y-0.5">
                  {latestReview.suggestions.slice(0, 3).map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-label text-white/35">
                      <span className="mt-1.5 h-0.5 w-0.5 shrink-0 rounded-full bg-white/20" />
                      <span className="line-clamp-1">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timestamp + freshness */}
            <div className="space-y-1.5 border-t border-border-default pt-3">
              <div className="text-caption text-white/25">
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
              <div className="mt-2 text-caption text-white/20">
                {reviews.length} reviews total
              </div>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center py-4">
            <p className="mb-3 text-xs text-white/30">No review yet</p>
            <Button
              variant="secondary"
              size="md"
              icon={reviewing
                ? <RefreshCw size={12} strokeWidth={1.5} className="animate-spin" />
                : <Sparkles size={12} strokeWidth={1.2} />
              }
              onClick={handleRunReview}
              disabled={reviewing}
            >
              {reviewing ? "Reviewing..." : "Run Review"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
