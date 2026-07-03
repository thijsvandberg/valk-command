"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSWRConfig } from "swr";
import { FileCheck2, FileX2, Loader2 } from "lucide-react";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { tickets as ticketsApi } from "@/lib/api-client";

export type TestDocMarkerState = "accepted" | "draft" | "not_needed" | null;

// Sized so a typical 3-8 line doc fits without scrolling (PO feedback).
const CARD_WIDTH = 520;
const CARD_MARGIN = 8;
const CARD_MAX_ESTIMATE = 560;

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

/** Hover card showing the actual doc; fetches lazily on open (SWR-less, tiny payload). */
function TestDocHoverCard({
  ticketKey,
  state,
  triggerRef,
  onMouseEnter,
  onMouseLeave,
  onOpenReview,
  onClose,
}: {
  ticketKey: string;
  state: TestDocMarkerState;
  triggerRef: React.RefObject<HTMLElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenReview?: () => void;
  onClose: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [marking, setMarking] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const [doc, setDoc] = useState<{ markdown: string; provenance: string } | null>(null);
  const [loading, setLoading] = useState(state === "accepted" || state === "draft");
  const [error, setError] = useState(false);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(Math.max(CARD_MARGIN, rect.left - CARD_WIDTH / 2), window.innerWidth - CARD_WIDTH - CARD_MARGIN);
    // Open below unless that would clip near the viewport bottom.
    const openUp = rect.bottom + CARD_MAX_ESTIMATE > window.innerHeight && rect.top > CARD_MAX_ESTIMATE;
    setPos({ left, top: openUp ? rect.top - 6 : rect.bottom + 6, openUp });
  }, [triggerRef]);

  useEffect(() => {
    if (state !== "accepted" && state !== "draft") return;
    let cancelled = false;
    ticketsApi
      .getTestDoc(ticketKey)
      .then((data) => {
        if (cancelled) return;
        const source = state === "accepted" ? data.saved : data.draft ?? data.saved;
        if (source) {
          const when = state === "accepted"
            ? (data.saved?.updatedAt ? new Date(data.saved.updatedAt).toLocaleString() : null)
            : (data.draft?.generatedAt ? new Date(data.draft.generatedAt).toLocaleString() : null);
          setDoc({
            markdown: source.markdown,
            provenance: state === "accepted"
              ? `Saved${when ? ` ${when}` : ""}`
              : `Draft — not yet saved${when ? ` (generated ${when})` : ""}`,
          });
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state, ticketKey]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={cardRef}
      data-testid="test-doc-hover-card"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={stop}
      onPointerDown={stop}
      className="fixed z-[9999] overflow-hidden rounded-xl border border-border-strong bg-surface-floating text-left normal-case tracking-normal shadow-popover"
      style={{ left: pos.left, top: pos.top, width: CARD_WIDTH, transform: pos.openUp ? "translateY(-100%)" : undefined }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3.5 py-2">
        <span className="text-caption font-medium uppercase tracking-wide text-text-tertiary">
          Test documentation
        </span>
        <span
          className={`text-caption font-medium ${
            state === "accepted"
              ? "text-[var(--color-status-success)]"
              : state === "draft"
                ? "text-[var(--color-status-warning)]"
                : "text-text-muted"
          }`}
        >
          {state === "accepted" ? "Saved" : state === "draft" ? "Draft" : state === "not_needed" ? "Not needed" : "Missing"}
        </span>
      </div>

      <div className="max-h-[min(480px,55vh)] overflow-y-auto px-3.5 py-3">
        {state === "not_needed" && (
          <p className="text-body-sm text-text-secondary">
            Marked as not needing test documentation. It is listed separately in the sprint
            bundle and never counted as missing.
          </p>
        )}
        {state === null && (
          <p className="text-body-sm text-text-secondary">No test documentation yet.</p>
        )}
        {(state === "accepted" || state === "draft") && (
          <>
            {loading && (
              <div className="flex h-16 items-center justify-center text-text-muted">
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
              </div>
            )}
            {error && !loading && (
              <p className="text-body-sm text-text-muted">Could not load the document.</p>
            )}
            {doc && !loading && (
              <>
                <p className="mb-2 text-caption text-text-muted">{doc.provenance}</p>
                <div className="description-content text-body-sm">{renderMarkdown(doc.markdown)}</div>
              </>
            )}
          </>
        )}
      </div>

      {(onOpenReview || state === null || state === "draft") && (
        <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-3.5 py-2">
          {onOpenReview ? (
            <button
              type="button"
              onClick={onOpenReview}
              className="cursor-pointer text-body-sm font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              {state === "accepted" || state === "draft" ? "Open review" : "Generate test doc"}
            </button>
          ) : (
            <span />
          )}
          {/* PO judgement straight from the board (no doc yet or unreviewed
              draft): mark the story as not needing test documentation. */}
          {(state === null || state === "draft") && (
            <button
              type="button"
              disabled={marking}
              onClick={() => {
                setMarking(true);
                ticketsApi
                  .markTestDocNotNeeded(ticketKey)
                  .then(() => {
                    void mutate(`/api/tickets/${encodeURIComponent(ticketKey)}`);
                    void mutate((k) => typeof k === "string" && k.startsWith("/api/tickets?"));
                    onClose();
                  })
                  .catch(() => setMarking(false));
              }}
              className="cursor-pointer text-body-sm text-text-muted hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:opacity-50"
            >
              {marking ? "Marking..." : "Not needed"}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

/**
 * Board-row test-doc state marker (BRDG-426): the icon shows the state at a
 * glance; hovering opens a card with the actual document (or the state
 * explanation) and a jump into the review/generate flow.
 */
export function TestDocMarker({
  ticketKey,
  state,
  onOpenReview,
}: {
  ticketKey: string;
  state: TestDocMarkerState;
  onOpenReview?: () => void;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpen = () => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; } };
  const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = setTimeout(() => setVisible(false), 250);
  }, []);

  const handleEnter = useCallback(() => {
    clearClose();
    if (visible) return;
    clearOpen();
    openTimer.current = setTimeout(() => setVisible(true), 300);
  }, [visible]);

  const handleLeave = useCallback(() => {
    clearOpen();
    scheduleClose();
  }, [scheduleClose]);

  useEffect(() => () => { clearOpen(); clearClose(); }, []);

  const title =
    state === "accepted"
      ? "Test documentation saved"
      : state === "draft"
        ? "Test doc generated — not yet reviewed/saved"
        : state === "not_needed"
          ? "Marked: no test documentation needed"
          : "No test documentation yet";

  return (
    <span
      ref={wrapperRef}
      data-testid={`test-doc-state-${state ?? "none"}`}
      title={visible ? undefined : title}
      tabIndex={0}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      onClick={(e) => {
        // Deliberate click opens the card immediately (skips the hover delay)
        // without selecting the row underneath.
        e.stopPropagation();
        clearOpen();
        setVisible(true);
      }}
      onPointerDown={stop}
      className="inline-flex shrink-0 cursor-pointer rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
    >
      {state === "not_needed" ? (
        <FileX2 size={14} strokeWidth={1.75} className="text-text-muted" />
      ) : (
        <FileCheck2
          size={14}
          strokeWidth={1.75}
          className={
            state === "accepted"
              ? "text-[var(--color-status-success)]"
              : state === "draft"
                ? "text-[var(--color-status-warning)]"
                : "text-text-muted opacity-40"
          }
        />
      )}
      {visible && (
        <TestDocHoverCard
          ticketKey={ticketKey}
          state={state}
          triggerRef={wrapperRef}
          onMouseEnter={clearClose}
          onMouseLeave={scheduleClose}
          onClose={() => {
            clearClose();
            setVisible(false);
          }}
          onOpenReview={
            onOpenReview
              ? () => {
                  clearClose();
                  setVisible(false);
                  onOpenReview();
                }
              : undefined
          }
        />
      )}
    </span>
  );
}
