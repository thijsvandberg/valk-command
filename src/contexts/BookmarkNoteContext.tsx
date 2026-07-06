"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

// Lazy: the capture card is only needed the first time the PO bookmarks something,
// so it stays out of the app-shell bundle until then (same as the launcher modal).
const BookmarkNoteCard = dynamic(
  () => import("@/components/shared/BookmarkNoteCard").then((m) => ({ default: m.BookmarkNoteCard })),
);

interface BookmarkNoteContextValue {
  /**
   * Opens the optional quick-note capture for freshly bookmarked ticket(s). Pass one
   * key for a single bookmark, or several to capture one shared note for a bulk
   * bookmark (the note is written to every target).
   */
  captureBookmarkNote: (ticketKeys: string | string[]) => void;
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
  const [active, setActive] = useState<{ ticketKeys: string[] } | null>(null);
  const { toast, showToast, dismissToast } = useToast();

  const captureBookmarkNote = useCallback((ticketKeys: string | string[]) => {
    const keys = Array.isArray(ticketKeys) ? ticketKeys : [ticketKeys];
    if (keys.length === 0) return;
    setActive({ ticketKeys: keys });
  }, []);

  // Confirm the note write. On a partial failure, surface how many landed vs failed so
  // the PO knows to retry rather than assuming a silent success.
  const handleSaved = useCallback((succeeded: number, failed: number) => {
    if (failed > 0) {
      showToast(
        succeeded > 0
          ? `Note added to ${succeeded} of ${succeeded + failed} stories (${failed} failed)`
          : "Could not save the note, please try again",
      );
      return;
    }
    showToast(succeeded === 1 ? "Note added" : `Note added to ${succeeded} stories`);
  }, [showToast]);

  return (
    <BookmarkNoteContext.Provider value={{ captureBookmarkNote }}>
      {children}
      {active && (
        // Key on the targets so re-bookmarking gives a fresh card (fresh timer + input).
        <BookmarkNoteCard
          key={active.ticketKeys.join(",")}
          ticketKeys={active.ticketKeys}
          onClose={() => setActive(null)}
          onSaved={handleSaved}
        />
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
    </BookmarkNoteContext.Provider>
  );
}

export function useBookmarkNoteCapture(): BookmarkNoteContextValue {
  return useContext(BookmarkNoteContext);
}
