"use client";

/**
 * Score-breakdown + disposition review drawer for the /cleanup view (BRDG-289,
 * see docs/plans/2026-06-04-backlog-deprecation-review-epic.md).
 *
 * Shows the selected ticket's per-topic scores, each topic's evidence, the
 * assembled rationale, and the Confirm / Dismiss (snooze) actions. Renders as a
 * right-side drawer in the same layered-surface idiom as the rest of /cleanup
 * (brand tokens, the shared ScoreBar heat ramp) rather than a new aesthetic.
 *
 * Nothing here writes to Jira: confirm/dismiss post to the local disposition API.
 */

import { useState, useCallback } from "react";
import useSWR from "swr";
import { X, Check, BellOff, RotateCcw, ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { scoreHeat } from "./cleanup-utils";
import { DISMISS_COOLDOWN_DAYS } from "@/lib/cleanup-disposition";
import type { ScanTopicKey, Disposition } from "@/lib/cleanup-types";

interface TopicBreakdown {
  key: ScanTopicKey;
  label: string;
  live: boolean;
  score: number | null;
  evidence: unknown;
  rationale: string | null;
}

interface DispositionDetail {
  key: string;
  title: string;
  status: string;
  scanOverall: number | null;
  scanRationale: string | null;
  lastScannedAt: string | null;
  lastDeepScannedAt: string | null;
  disposition: Disposition;
  dispositionUntil: string | null;
  dispositionNote: string | null;
  topics: TopicBreakdown[];
}

interface DispositionPanelProps {
  jiraKey: string;
  /** Open the full ticket SidePanel for management (notes, status, etc.). */
  onOpenTicket: (key: string) => void;
  /** Navigate the breakdown to another ticket (e.g. the superseded-by link). */
  onNavigate: (key: string) => void;
  onClose: () => void;
  /** Called after a disposition write so the list can refresh its badges. */
  onDisposed: () => void;
}

const TOPIC_HEAT_FALLBACK = "var(--color-status-neutral)";

function MiniScore({ score }: { score: number | null }) {
  if (score == null) return <span className="text-label text-text-muted">—</span>;
  const heat = scoreHeat(score);
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2" title={score.toFixed(2)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ backgroundColor: heat.track }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: heat.color }} />
      </div>
      <span className="tabular-nums text-label text-text-tertiary">{score.toFixed(2)}</span>
    </div>
  );
}

/**
 * Render one topic's structured evidence. Each topic attaches its own shape, so
 * this branches on the known keys (BRDG-285..288). The duplicate topic's
 * supersededBy renders as a clickable link that re-targets the drawer.
 */
function TopicEvidence({
  topicKey,
  evidence,
  onNavigate,
}: {
  topicKey: ScanTopicKey;
  evidence: unknown;
  onNavigate: (key: string) => void;
}) {
  if (evidence == null) return null;
  const e = evidence as Record<string, unknown>;

  if (topicKey === "duplicate" && typeof e.supersededBy === "string" && e.supersededBy) {
    return (
      <div className="space-y-1 text-label text-text-tertiary">
        <div className="flex items-center gap-1.5">
          <span>Superseded by</span>
          <button
            type="button"
            onClick={() => onNavigate(e.supersededBy as string)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[var(--color-brand-500)]/10 px-1.5 py-0.5 font-mono font-semibold text-[var(--color-brand-300)] transition-colors duration-150 hover:bg-[var(--color-brand-500)]/20 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
            title={`Open the superseding ticket ${e.supersededBy}`}
          >
            {e.supersededBy as string}
            <ArrowRight size={11} strokeWidth={2} />
          </button>
        </div>
        {typeof e.matchReason === "string" && e.matchReason && (
          <p className="leading-relaxed text-text-muted">{e.matchReason}</p>
        )}
        {typeof e.overlapScore === "number" && (
          <p className="tabular-nums text-text-muted">Overlap {e.overlapScore.toFixed(2)}</p>
        )}
      </div>
    );
  }

  if (topicKey === "alreadyBuilt") {
    const implementedIn = typeof e.implementedIn === "string" ? e.implementedIn : null;
    return (
      <div className="space-y-1 text-label text-text-tertiary">
        {implementedIn ? (
          <p className="leading-relaxed">
            Implemented in <span className="font-mono text-text-secondary">{implementedIn}</span>
          </p>
        ) : (
          <p className="leading-relaxed text-text-muted">Appears already implemented</p>
        )}
        {e.degraded === true && (
          <p className="text-text-muted opacity-70">Degraded result (lower confidence)</p>
        )}
      </div>
    );
  }

  if (topicKey === "replaced") {
    const matched = Array.isArray(e.matchedKeywords) ? e.matchedKeywords : Array.isArray(e.matched) ? e.matched : null;
    if (matched && matched.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {matched.map((kw, i) => (
            <span
              key={i}
              className="rounded-md bg-[var(--color-status-error-subtle)] px-1.5 py-0.5 text-label font-medium"
              style={{ color: "var(--color-status-error)" }}
            >
              {String(kw)}
            </span>
          ))}
        </div>
      );
    }
  }

  if (topicKey === "relevance" && typeof e.relevance === "string") {
    return (
      <p className="text-label text-text-tertiary">
        Relevance: <span className="font-medium text-text-secondary">{e.relevance}</span>
      </p>
    );
  }

  // Fallback: a plain string evidence (e.g. Tier-1 staleness) or unknown shape.
  if (typeof evidence === "string") {
    return <p className="text-label leading-relaxed text-text-tertiary">{evidence}</p>;
  }
  return null;
}

const DISPOSITION_LABEL: Record<NonNullable<Disposition>, string> = {
  candidate: "Candidate",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
};

export function DispositionPanel({
  jiraKey,
  onOpenTicket,
  onNavigate,
  onClose,
  onDisposed,
}: DispositionPanelProps) {
  const { data, isLoading, mutate } = useSWR<DispositionDetail>(
    `/api/cleanup/${encodeURIComponent(jiraKey)}/disposition`,
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const act = useCallback(
    async (action: "confirm" | "dismiss" | "reset") => {
      setBusy(true);
      try {
        await fetch(`/api/cleanup/${encodeURIComponent(jiraKey)}/disposition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note: note.trim() || undefined }),
        });
        await mutate();
        onDisposed();
        setNote("");
      } finally {
        setBusy(false);
      }
    },
    [jiraKey, note, mutate, onDisposed],
  );

  const scoredTopics = (data?.topics ?? []).filter((t) => t.score != null);
  const currentDisposition = data?.disposition ?? null;

  return (
    <aside
      className="flex w-[420px] shrink-0 flex-col overflow-hidden border-l border-border-default bg-[var(--color-surface-base)]"
      style={{ boxShadow: "var(--shadow-lg)" }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-label font-semibold text-[var(--color-brand-300)]">{jiraKey}</span>
            {currentDisposition && (
              <span className="rounded-full bg-overlay-subtle px-2 py-0.5 text-label font-medium text-text-tertiary">
                {DISPOSITION_LABEL[currentDisposition]}
              </span>
            )}
          </div>
          <h2 className="mt-1 truncate font-[var(--font-display)] text-body-lg font-semibold text-text-primary" title={data?.title}>
            {data?.title ?? "Loading…"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
          title="Close"
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-overlay-subtle" style={{ opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        ) : !data ? (
          <p className="text-body-sm text-text-tertiary">Could not load the breakdown.</p>
        ) : (
          <>
            {/* Overall + scan timestamps */}
            <div className="mb-4 flex items-center justify-between rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] px-4 py-3">
              <div>
                <span className="text-label uppercase tracking-wider text-text-muted">Overall</span>
                <div className="mt-1">
                  <MiniScore score={data.scanOverall} />
                </div>
              </div>
              <div className="text-right text-label text-text-muted">
                {data.lastDeepScannedAt ? (
                  <span title={formatAbsoluteDate(data.lastDeepScannedAt)}>
                    deep-scanned {relativeDate(data.lastDeepScannedAt)}
                  </span>
                ) : data.lastScannedAt ? (
                  <span title={formatAbsoluteDate(data.lastScannedAt)}>scanned {relativeDate(data.lastScannedAt)}</span>
                ) : (
                  <span>never scanned</span>
                )}
              </div>
            </div>

            {/* Per-topic breakdown */}
            <h3 className="mb-2 text-label uppercase tracking-wider text-text-muted">Score breakdown</h3>
            {scoredTopics.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-center text-body-sm text-text-tertiary">
                No topic has scored this ticket yet. Queue a deep scan to evaluate it.
              </p>
            ) : (
              <ul className="space-y-2">
                {scoredTopics.map((t) => (
                  <li
                    key={t.key}
                    className="rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-body-sm font-medium text-text-secondary">
                        {t.label}
                        {t.key === "relevance" && (
                          <span className="ml-1 text-text-muted opacity-50" style={{ fontStyle: "italic" }} title="AI judgement call — lower trust">
                            ~
                          </span>
                        )}
                      </span>
                      <MiniScore score={t.score} />
                    </div>
                    {(t.evidence != null || t.rationale) && (
                      <div className="mt-2 space-y-1.5">
                        <TopicEvidence topicKey={t.key} evidence={t.evidence} onNavigate={onNavigate} />
                        {t.rationale && (
                          <p className="text-label leading-relaxed text-text-muted">{t.rationale}</p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Assembled rationale */}
            {data.scanRationale && (
              <div className="mt-4">
                <h3 className="mb-2 text-label uppercase tracking-wider text-text-muted">Why this can probably go</h3>
                <p
                  className="rounded-xl border-l-2 px-4 py-3 text-body-sm leading-relaxed text-text-secondary"
                  style={{ borderColor: scoreHeat(data.scanOverall).color, backgroundColor: "var(--color-surface-elevated)" }}
                >
                  {data.scanRationale}
                </p>
              </div>
            )}

            {/* Existing disposition note / cooldown */}
            {currentDisposition === "dismissed" && data.dispositionUntil && (
              <p className="mt-4 text-label text-text-tertiary">
                Snoozed until{" "}
                <span title={formatAbsoluteDate(data.dispositionUntil)}>{relativeDate(data.dispositionUntil)}</span>.
              </p>
            )}
            {data.dispositionNote && (
              <p className="mt-2 rounded-lg bg-overlay-subtle px-3 py-2 text-label italic leading-relaxed text-text-tertiary">
                “{data.dispositionNote}”
              </p>
            )}

            {/* Open the full ticket for management. */}
            <button
              type="button"
              onClick={() => onOpenTicket(jiraKey)}
              className="mt-4 inline-flex cursor-pointer items-center gap-1.5 text-label font-medium text-[var(--color-brand-400)] transition-colors duration-150 hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
            >
              <ExternalLink size={12} strokeWidth={2} />
              Open full ticket
            </button>
          </>
        )}
      </div>

      {/* Action footer */}
      <div className="border-t border-border-default px-5 py-4">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (e.g. why this is a false positive)…"
          rows={2}
          maxLength={500}
          className="mb-3 w-full resize-none rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-body-sm text-text-secondary placeholder:text-text-muted focus-visible:border-[var(--color-brand-500)]/40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
        />
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            disabled={busy || currentDisposition === "confirmed"}
            onClick={() => void act("confirm")}
            title="Mark this ticket as removable (local only, no Jira write)"
            className="flex-1"
          >
            <Check size={14} strokeWidth={2} />
            Confirm
          </Button>
          <Button
            variant="ghost"
            size="lg"
            disabled={busy || currentDisposition === "dismissed"}
            onClick={() => void act("dismiss")}
            title={`Snooze as a false positive for ${DISMISS_COOLDOWN_DAYS} days`}
            className="flex-1"
          >
            <BellOff size={14} strokeWidth={1.5} />
            Dismiss
          </Button>
          {currentDisposition && (
            <Button
              variant="ghost"
              size="lg"
              iconOnly
              disabled={busy}
              onClick={() => void act("reset")}
              title="Clear disposition"
            >
              <RotateCcw size={14} strokeWidth={1.5} />
            </Button>
          )}
        </div>
        <p className="mt-2 text-label text-text-muted">
          Local marker only. Nothing is written to Jira.
        </p>
      </div>
    </aside>
  );
}
