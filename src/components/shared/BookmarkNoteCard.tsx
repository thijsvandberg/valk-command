"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, X } from "lucide-react";
import { ToastCard } from "@/components/ui/Toast";
import { TextInput } from "@/components/shared/TextInput";
import { tickets as ticketsApi } from "@/lib/api-client";
import { patchTicketDetailCache } from "@/lib/ticket-cache";
import { scopedMutate } from "@/lib/swr-scoped-mutate";

// A comfortable few seconds: long enough to notice and opt in, short enough that an
// ignored card fades on its own (BRDG-475). Single const so it stays tunable.
export const AUTO_DISMISS_MS = 6000;

interface BookmarkNoteCardProps {
  ticketKey: string;
  /** Closes the card. The provider drops the active instance; the card never writes on close. */
  onClose: () => void;
}

/**
 * Non-blocking quick-note capture shown when a story is bookmarked ON (BRDG-475).
 * Reuses the ToastCard surface + shared TextInput. The note reuses the PO note
 * (`poNotes`); it is always optional.
 *
 * Behaviour:
 * - Auto-dismisses after AUTO_DISMISS_MS when untouched, writing nothing.
 * - Focusing or typing cancels the auto-dismiss timer permanently for this instance
 *   (the mount effect only ever starts the timer; engage() clears + nulls it, so it
 *   can never re-arm).
 * - Never autofocuses, so it does not steal focus / trap the page — the PO opts in.
 * - Saves on Enter or on blur-with-text; dismisses (no write) on Escape, the cross,
 *   the auto-timer, or a blur with no text.
 * - Pre-fills the existing note so the PO edits in place rather than clobbering it;
 *   a late-resolving pre-fill never overwrites what the PO has already typed.
 */
export function BookmarkNoteCard({ ticketKey, onClose }: BookmarkNoteCardProps) {
  const [text, setText] = useState("");

  // Async closures (the auto-timer, the pre-fill fetch) capture stale state, so the
  // load-bearing flags live in refs read at fire time.
  const textRef = useRef("");
  const engagedRef = useRef(false);
  const savedRef = useRef(false);
  const closingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

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
    // Optimistic: reflect the note in the open detail/editor immediately, then persist
    // and revalidate the cross-sprint bookmark list (launcher + /bookmarks note-hover).
    patchTicketDetailCache(ticketKey, { notes: value });
    void ticketsApi
      .updateMetadata(ticketKey, { poNotes: value })
      .then(() => scopedMutate("/api/bookmarks"))
      .catch(() => {});
    close();
  };

  // Start the auto-dismiss timer and kick off the pre-fill exactly once. The timer is
  // only ever started here; engage() owns cancellation, so it can never re-arm.
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      close();
    }, AUTO_DISMISS_MS);

    const abort = new AbortController();
    ticketsApi
      .getMetadata(ticketKey, abort.signal)
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
    // ticketKey is stable per card instance (the provider keys the card on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    engage();
    textRef.current = e.target.value;
    setText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // A real focus-out (tab/click away): save when there is text, otherwise dismiss.
  // The cross prevents mousedown default so it never blurs the input, so this only
  // fires when focus genuinely leaves the card.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    commit();
  };

  if (typeof document === "undefined") return null;

  // Portal to <body> like the status Toast so a positioned/transformed ancestor cannot
  // trap the card in a lower stacking context. A distinct bottom offset (bottom-24)
  // keeps it clear of the status toast (bottom-6), sync stack (bottom-4) and export
  // cards (bottom-16) so simultaneous toasts never overlap.
  return createPortal(
    <div className="fixed right-6 bottom-24 z-notification w-[min(20rem,calc(100vw-3rem))] pointer-events-none">
      <ToastCard
        variant="neutral"
        icon={<Bookmark className="h-4 w-4 text-[var(--color-brand-400)]" strokeWidth={1.5} />}
      >
        <div onBlur={handleBlur} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-sm text-text-secondary">
              Bookmarked <span className="font-medium text-text-primary">{ticketKey}</span>
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={close}
              aria-label="Dismiss without saving a note"
              className="-mr-1 shrink-0 cursor-pointer rounded text-text-muted hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          <TextInput
            inputSize="sm"
            value={text}
            onChange={handleChange}
            onFocus={engage}
            onKeyDown={handleKeyDown}
            placeholder="Add an optional note…"
            aria-label={`Add an optional note for ${ticketKey}`}
          />
        </div>
      </ToastCard>
    </div>,
    document.body,
  );
}
