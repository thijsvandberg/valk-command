import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookmarkNoteCard, AUTO_DISMISS_MS } from "./BookmarkNoteCard";

const getMetadata = vi.fn();
const updateMetadata = vi.fn();
const patchTicketDetailCache = vi.fn();
const scopedMutate = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    getMetadata: (...args: unknown[]) => getMetadata(...args),
    updateMetadata: (...args: unknown[]) => updateMetadata(...args),
  },
}));
vi.mock("@/lib/ticket-cache", () => ({
  patchTicketDetailCache: (...args: unknown[]) => patchTicketDetailCache(...args),
}));
vi.mock("@/lib/swr-scoped-mutate", () => ({
  scopedMutate: (...args: unknown[]) => scopedMutate(...args),
}));

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  getMetadata.mockReset().mockResolvedValue({});
  updateMetadata.mockReset().mockResolvedValue({});
  patchTicketDetailCache.mockReset();
  scopedMutate.mockReset();
});

describe("BookmarkNoteCard (BRDG-475)", () => {
  it("does not autofocus and renders the ticket key + optional-note placeholder", async () => {
    render(<BookmarkNoteCard ticketKey="VPL-42" onClose={vi.fn()} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    // No focus stealing: the card must not trap/steal focus on appear.
    expect(document.activeElement).not.toBe(input);
    expect(input).toHaveAttribute("placeholder", "Add an optional note…");
    expect(screen.getByText("VPL-42")).toBeInTheDocument();
    await flush();
  });

  it("auto-dismisses after the delay when untouched and writes no note", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<BookmarkNoteCard ticketKey="VPL-42" onClose={onClose} />);

      expect(onClose).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(AUTO_DISMISS_MS); });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(updateMetadata).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the auto-dismiss for good once focused (never fires afterward)", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<BookmarkNoteCard ticketKey="VPL-42" onClose={onClose} />);

      fireEvent.focus(screen.getByRole("textbox"));
      act(() => { vi.advanceTimersByTime(AUTO_DISMISS_MS * 3); });

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels the auto-dismiss on the first keystroke", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<BookmarkNoteCard ticketKey="VPL-42" onClose={onClose} />);

      fireEvent.change(screen.getByRole("textbox"), { target: { value: "w" } });
      act(() => { vi.advanceTimersByTime(AUTO_DISMISS_MS * 3); });

      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves on Enter: writes poNotes, patches the detail cache, revalidates bookmarks", async () => {
    const onClose = vi.fn();
    render(<BookmarkNoteCard ticketKey="VPL-42" onClose={onClose} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "  why I saved it  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateMetadata).toHaveBeenCalledWith("VPL-42", { poNotes: "why I saved it" });
    expect(patchTicketDetailCache).toHaveBeenCalledWith("VPL-42", { notes: "why I saved it" });
    expect(onClose).toHaveBeenCalledTimes(1);

    await flush();
    expect(scopedMutate).toHaveBeenCalledWith("/api/bookmarks");
  });

  it("saves on blur when there is text", async () => {
    const onClose = vi.fn();
    render(<BookmarkNoteCard ticketKey="VPL-42" onClose={onClose} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "note" } });
    fireEvent.blur(input);

    expect(updateMetadata).toHaveBeenCalledWith("VPL-42", { poNotes: "note" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await flush();
  });

  it("makes no metadata write when dismissed with Escape and no text", () => {
    const onClose = vi.fn();
    render(<BookmarkNoteCard ticketKey="VPL-42" onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(updateMetadata).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("makes no metadata write when auto-dismissed with no text", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<BookmarkNoteCard ticketKey="VPL-42" onClose={onClose} />);
      act(() => { vi.advanceTimersByTime(AUTO_DISMISS_MS); });
      expect(updateMetadata).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pre-fills the existing note so the PO edits in place", async () => {
    getMetadata.mockResolvedValue({ poNotes: "existing reason" });
    render(<BookmarkNoteCard ticketKey="VPL-42" onClose={vi.fn()} />);

    await flush();
    expect(screen.getByRole("textbox")).toHaveValue("existing reason");
  });

  it("a late-resolving pre-fill never clobbers what the PO already typed", async () => {
    let resolveMeta: (v: unknown) => void = () => {};
    getMetadata.mockReturnValue(new Promise((res) => { resolveMeta = res; }));
    render(<BookmarkNoteCard ticketKey="VPL-42" onClose={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "typed by PO" } });

    await act(async () => { resolveMeta({ poNotes: "stale note" }); await Promise.resolve(); });

    expect(input).toHaveValue("typed by PO");
  });
});
