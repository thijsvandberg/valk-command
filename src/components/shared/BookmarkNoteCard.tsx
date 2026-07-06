"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, X } from "lucide-react";
import { ToastCard } from "@/components/ui/Toast";
import { tickets as ticketsApi } from "@/lib/api-client";
import { patchTicketCaches, revalidateTicketCaches } from "@/lib/ticket-cache";
import { scopedMutate } from "@/lib/swr-scoped-mutate";

// A comfortable few seconds: long enough to notice and opt in, short enough that an
// ignored card fades on its own (BRDG-475). Single const so it stays tunable.
export const AUTO_DISMISS_MS = 6000;

interface BookmarkNoteCardProps {
  /** The ticket(s) just bookmarked. One shared note is written to all of them. */
  ticketKeys: string[];
  /** Closes the card. The provider drops the active instance; the card never writes on close. */
  onClose: () => void;
  /** Fired after the note write settles, so the host can confirm (toast). */
  onSaved?: (succeeded: number, failed: number) => void;
}

/**
 * Non-blocking quick-note capture shown when a story is bookmarked ON (BRDG-475).
 * Reuses the ToastCard surface. The note reuses the PO note (`poNotes`); it is always
 * optional. When several stories are bookmarked at once (bulk), one shared note is
 * written to all of them.
 *
 * Behaviour:
 * - Auto-dismisses after AUTO_DISMISS_MS when untouched, writing nothing.
 * - Focusing or typing cancels the auto-dismiss timer permanently for this instance
 *   (the mount effect only ever starts the timer; engage() clears + nulls it, so it
 *   can never re-arm).
 * - Never autofocuses, so it does not steal focus / trap the page — the PO opts in.
 * - The field auto-grows with the note; Enter saves, Shift+Enter adds a line.
 * - Saves on Enter or on blur-with-text; dismisses (no write) on Escape, the cross,
 *   the auto-timer, or a blur with no text.
 * - For a single ticket, pre-fills the existing note so the PO edits in place rather
 *   than clobbering it; a late-resolving pre-fill never overwrites what was typed.
 *   Bulk capture never pre-fills (the one note is written to every target).
 */
export function BookmarkNoteCard({ ticketKeys, onClose, onSaved }: BookmarkNoteCardProps) {
  const [text, setText] = useState("");

  // Async closures (the auto-timer, the pre-fill fetch, the settled write) capture
  // stale state/props, so the load-bearing values live in refs read at fire time.
  const textRef = useRef("");
  const engagedRef = useRef(false);
  const savedRef = useRef(false);
  const closingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  const onSavedRef = useRef(onSaved);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);

  const count = ticketKeys.length;
  const isBulk = count > 1;

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // Every close path funnels here so a write can never race a dismiss and so the
  // component closes exactly once.
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    clearTimer();
    onCloseRef.current();
  };

  // The moment the PO engages, the auto-dismiss is cancelled for good.
  const engage = () => {
    engagedRef.current = true;
    clearTimer();
  };

  const commit = () => {
    if (savedRef.current || closingRef.current) return;
    const value = textRef.current.trim();
    if (!value) { close(); return; }
    savedRef.current = true;
    const keys = ticketKeys;
    // Optimistic: reflect the note in the board rows AND any open detail/editor
    // immediately (patchTicketCaches covers the list + detail + byKeys caches), so the
    // board's note marker appears at once for every target.
    keys.forEach((k) => patchTicketCaches(k, { notes: value }));
    // Persist to every target, then revalidate the cross-sprint bookmark list once
    // (launcher + /bookmarks note-hover). Report success/failure so the host can
    // confirm; on any failure, revalidate so the optimistic board note self-heals.
    void (async () => {
      const results = await Promise.allSettled(
        keys.map(async (k) => {
          // Single-item capture pre-fills the existing note, so `value` already is the
          // full edited note -> write it as-is. Bulk can't pre-fill (N different notes),
          // so it APPENDS to any existing note rather than clobbering it (BRDG-480).
          let note = value;
          if (isBulk) {
            try {
              const meta = await ticketsApi.getMetadata(k);
              const existing = typeof meta?.poNotes === "string" ? meta.poNotes.trim() : "";
              if (existing) {
                note = `${existing}\n\n${value}`;
                patchTicketCaches(k, { notes: note });
              }
            } catch {
              // Fetch failed: fall back to writing just the typed value (no worse than
              // the pre-BRDG-480 behaviour), so a note is never silently dropped.
            }
          }
          return ticketsApi.updateMetadata(k, { poNotes: note });
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      scopedMutate("/api/bookmarks");
      if (failed) revalidateTicketCaches();
      onSavedRef.current?.(keys.length - failed, failed);
    })();
    close();
  };

  // Start the auto-dismiss timer and (single-ticket only) kick off the pre-fill, once.
  // The timer is only ever started here; engage() owns cancellation, so it can never
  // re-arm.
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      close();
    }, AUTO_DISMISS_MS);

    // Bulk capture writes one note to every target, so there is no single existing
    // note to pre-fill — skip the fetch entirely.
    if (count !== 1) return () => clearTimer();

    const abort = new AbortController();
    ticketsApi
      .getMetadata(ticketKeys[0], abort.signal)
      .then((meta) => {
        const existing = typeof meta?.poNotes === "string" ? meta.poNotes : "";
        // Only pre-fill if the PO has not engaged/typed yet: a late fetch must never
        // clobber what they have already written.
        if (existing && !engagedRef.current && textRef.current === "") {
          textRef.current = existing;
          setText(existing);
        }
      })
      .catch(() => {});

    return () => {
      clearTimer();
      abort.abort();
    };
    // ticketKeys is stable per card instance (the provider keys the card on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    engage();
    textRef.current = e.target.value;
    setText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter saves; Shift+Enter inserts a newline (the field auto-grows to fit).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // A real focus-out (tab/click away): save when there is text, otherwise dismiss.
  // The cross prevents mousedown default so it never blurs the field, so this only
  // fires when focus genuinely leaves the card.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    commit();
  };

  if (typeof document === "undefined") return null;

  const label = isBulk ? `${count} stories` : ticketKeys[0];
  const ariaTarget = isBulk ? `${count} bookmarked stories` : ticketKeys[0];

  // Portal to <body> like the status Toast so a positioned/transformed ancestor cannot
  // trap the card in a lower stacking context. A distinct bottom offset (bottom-24)
  // keeps it clear of the status toast (bottom-6), sync stack (bottom-4) and export
  // cards (bottom-16) so simultaneous toasts never overlap.
  return createPortal(
    <div className="fixed right-6 bottom-24 z-notification w-[min(22rem,calc(100vw-3rem))] pointer-events-none">
      <ToastCard variant="neutral" className="shadow-lg">
        <div onBlur={handleBlur} className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/10 ring-1 ring-inset ring-[var(--color-brand-500)]/20">
              <Bookmark className="h-3.5 w-3.5 text-[var(--color-brand-400)]" fill="currentColor" strokeWidth={1.5} />
            </span>
            <p className="min-w-0 flex-1 truncate pt-0.5 text-body-sm text-text-secondary">
              Bookmarked <span className="font-semibold text-text-primary">{label}</span>
            </p>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={close}
              aria-label="Dismiss without saving a note"
              className="-mr-1 -mt-0.5 shrink-0 cursor-pointer rounded text-text-muted transition-colors hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          <textarea
            rows={1}
            value={text}
            onChange={handleChange}
            onFocus={engage}
            onKeyDown={handleKeyDown}
            placeholder={isBulk ? "Add one note for all — why you saved them" : "Add a note — why you saved it"}
            aria-label={`Add an optional note for ${ariaTarget}`}
            className="max-h-32 w-full resize-none overflow-y-auto rounded-lg border border-border-strong bg-overlay-subtle px-3 py-1.5 text-body-lg leading-body text-text-primary transition-colors duration-150 placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none [field-sizing:content]"
          />

          <div className="flex items-center justify-between text-caption text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-overlay-default px-1 py-0.5 font-mono text-text-muted">↵</kbd>
                save
              </span>
              <span className="opacity-50">·</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-overlay-default px-1 py-0.5 font-mono text-text-muted">esc</kbd>
                dismiss
              </span>
            </span>
            <span className="italic">optional</span>
          </div>
        </div>
      </ToastCard>
    </div>,
    document.body,
  );
}
