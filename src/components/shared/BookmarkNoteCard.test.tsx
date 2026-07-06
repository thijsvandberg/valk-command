import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BookmarkNoteCard, AUTO_DISMISS_MS } from "./BookmarkNoteCard";

const getMetadata = vi.fn();
const updateMetadata = vi.fn();
const patchTicketCaches = vi.fn();
const revalidateTicketCaches = vi.fn();
const scopedMutate = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    getMetadata: (...args: unknown[]) => getMetadata(...args),
    updateMetadata: (...args: unknown[]) => updateMetadata(...args),
  },
}));
vi.mock("@/lib/ticket-cache", () => ({
  patchTicketCaches: (...args: unknown[]) => patchTicketCaches(...args),
  revalidateTicketCaches: (...args: unknown[]) => revalidateTicketCaches(...args),
}));
vi.mock("@/lib/swr-scoped-mutate", () => ({
  scopedMutate: (...args: unknown[]) => scopedMutate(...args),
}));

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  getMetadata.mockReset().mockResolvedValue({});
  updateMetadata.mockReset().mockResolvedValue({});
  patchTicketCaches.mockReset();
  revalidateTicketCaches.mockReset();
  scopedMutate.mockReset();
});

describe("BookmarkNoteCard (BRDG-475)", () => {
  it("does not autofocus and renders the ticket key + optional-note placeholder", async () => {
    render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={vi.fn()} />);

    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    // No focus stealing: the card must not trap/steal focus on appear.
    expect(document.activeElement).not.toBe(input);
    expect(input).toHaveAttribute("placeholder", "Add a note — why you saved it");
    expect(screen.getByText("VPL-42")).toBeInTheDocument();
    await flush();
  });

  it("auto-dismisses after the delay when untouched and writes no note", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} />);

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
      render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} />);

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
      render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} />);

      fireEvent.change(screen.getByRole("textbox"), { target: { value: "w" } });
      act(() => { vi.advanceTimersByTime(AUTO_DISMISS_MS * 3); });

      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves on Enter: writes poNotes, patches the board+detail caches, revalidates bookmarks, confirms", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} onSaved={onSaved} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "  why I saved it  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateMetadata).toHaveBeenCalledWith("VPL-42", { poNotes: "why I saved it" });
    expect(patchTicketCaches).toHaveBeenCalledWith("VPL-42", { notes: "why I saved it" });
    expect(onClose).toHaveBeenCalledTimes(1);

    await flush();
    expect(scopedMutate).toHaveBeenCalledWith("/api/bookmarks");
    expect(onSaved).toHaveBeenCalledWith(1, 0);
    expect(revalidateTicketCaches).not.toHaveBeenCalled();
  });

  it("saves on blur when there is text", async () => {
    const onClose = vi.fn();
    render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "note" } });
    fireEvent.blur(input);

    expect(updateMetadata).toHaveBeenCalledWith("VPL-42", { poNotes: "note" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await flush();
  });

  it("makes no metadata write when dismissed with Escape and no text", () => {
    const onClose = vi.fn();
    render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(updateMetadata).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("makes no metadata write when auto-dismissed with no text", () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} />);
      act(() => { vi.advanceTimersByTime(AUTO_DISMISS_MS); });
      expect(updateMetadata).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pre-fills the existing note so the PO edits in place", async () => {
    getMetadata.mockResolvedValue({ poNotes: "existing reason" });
    render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={vi.fn()} />);

    await flush();
    expect(screen.getByRole("textbox")).toHaveValue("existing reason");
  });

  it("a late-resolving pre-fill never clobbers what the PO already typed", async () => {
    let resolveMeta: (v: unknown) => void = () => {};
    getMetadata.mockReturnValue(new Promise((res) => { resolveMeta = res; }));
    render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={vi.fn()} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "typed by PO" } });

    await act(async () => { resolveMeta({ poNotes: "stale note" }); await Promise.resolve(); });

    expect(input).toHaveValue("typed by PO");
  });

  it("bulk: writes one shared note to every target, patches each, confirms all, never pre-fills", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<BookmarkNoteCard ticketKeys={["A-1", "A-2", "A-3"]} onClose={onClose} onSaved={onSaved} />);

    // No per-ticket pre-fill fetch for a bulk capture.
    expect(getMetadata).not.toHaveBeenCalled();
    expect(screen.getByText("3 stories")).toBeInTheDocument();

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "sprint review batch" } });
    fireEvent.keyDown(input, { key: "Enter" });

    for (const k of ["A-1", "A-2", "A-3"]) {
      expect(updateMetadata).toHaveBeenCalledWith(k, { poNotes: "sprint review batch" });
      expect(patchTicketCaches).toHaveBeenCalledWith(k, { notes: "sprint review batch" });
    }
    expect(onClose).toHaveBeenCalledTimes(1);
    await flush();
    expect(scopedMutate).toHaveBeenCalledWith("/api/bookmarks");
    expect(onSaved).toHaveBeenCalledWith(3, 0);
  });

  it("reports a partial failure and self-heals the board when a write rejects", async () => {
    updateMetadata.mockImplementation((k: string) =>
      k === "A-2" ? Promise.reject(new Error("boom")) : Promise.resolve({}),
    );
    const onSaved = vi.fn();
    render(<BookmarkNoteCard ticketKeys={["A-1", "A-2"]} onClose={vi.fn()} onSaved={onSaved} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "batch note" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await flush();
    expect(onSaved).toHaveBeenCalledWith(1, 1);
    expect(revalidateTicketCaches).toHaveBeenCalledTimes(1);
  });

  it("supports Shift+Enter for a newline without saving", () => {
    const onClose = vi.fn();
    render(<BookmarkNoteCard ticketKeys={["VPL-42"]} onClose={onClose} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "line one" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(updateMetadata).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
