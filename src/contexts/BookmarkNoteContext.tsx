"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

// Lazy: the capture card is only needed the first time the PO bookmarks something,
// so it stays out of the app-shell bundle until then (same as the launcher modal).
const BookmarkNoteCard = dynamic(
  () => import("@/components/shared/BookmarkNoteCard").then((m) => ({ default: m.BookmarkNoteCard })),
);

interface BookmarkNoteContextValue {
  /** Opens the optional quick-note capture for a freshly bookmarked ticket. */
  captureBookmarkNote: (ticketKey: string) => void;
}

const NOOP = () => {};

// Default to a no-op so a consumer rendered outside the provider (or a bare hook test)
// degrades silently instead of crashing.
const BookmarkNoteContext = createContext<BookmarkNoteContextValue>({ captureBookmarkNote: NOOP });

/**
 * Mounts a single quick-note capture card at the app shell and hands every descendant
 * a trigger (BRDG-475). Bookmarking happens from many surfaces (board rows, the row
 * menu, inbox hover, the ticket header, the Story Writer header); a single,
 * trigger-independent surface hosted here keeps the affordance uniform across all of
 * them. Only one card is active at a time — a rapid second bookmark supersedes the
 * first (no queue), matching the optional, non-blocking intent.
 */
export function BookmarkNoteProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ ticketKey: string } | null>(null);

  const captureBookmarkNote = useCallback((ticketKey: string) => {
    setActive({ ticketKey });
  }, []);

  return (
    <BookmarkNoteContext.Provider value={{ captureBookmarkNote }}>
      {children}
      {active && (
        // Key on the ticket so re-bookmarking gives a fresh card (fresh timer + input).
        <BookmarkNoteCard
          key={active.ticketKey}
          ticketKey={active.ticketKey}
          onClose={() => setActive(null)}
        />
      )}
    </BookmarkNoteContext.Provider>
  );
}

export function useBookmarkNoteCapture(): BookmarkNoteContextValue {
  return useContext(BookmarkNoteContext);
}
