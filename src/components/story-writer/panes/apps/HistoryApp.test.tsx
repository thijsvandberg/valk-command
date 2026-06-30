import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HistoryApp } from "./HistoryApp";

vi.mock("../WriterContext", () => ({
  useWriterContext: vi.fn(),
}));

vi.mock("../PaneContext", () => ({
  usePaneContext: vi.fn(),
}));

// Capture the props TicketHistory receives so we can assert the restore wiring,
// and expose a trigger that invokes onRestored like a real restore would.
vi.mock("@/components/ticket-detail/TicketHistory", () => ({
  TicketHistory: ({ onRestored }: { onRestored?: (content: string) => void }) => (
    <div data-testid="ticket-history">
      <button data-testid="trigger-restore" onClick={() => onRestored?.("restored content")}>
        restore
      </button>
    </div>
  ),
}));

import { useWriterContext } from "../WriterContext";
import { usePaneContext } from "../PaneContext";

function makeWriterCtx(overrides = {}) {
  return {
    ticketKey: "VPL-1",
    session: { id: "s1", localDraft: "## Current draft", localTitle: "My Story" },
    aiDrafts: [],
    baseDescription: "",
    splitModeVisible: false,
    targetTicketKey: null,
    onDraftChange: vi.fn(),
    onTitleChange: vi.fn(),
    onDismissDraft: vi.fn(),
    ticketData: { key: "VPL-1", title: "Test" },
    outdated: false,
    targetOutdated: false,
    onTakeJiraVersion: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makePaneCtx(overrides = {}) {
  return {
    registerToolbar: vi.fn(),
    unregisterToolbar: vi.fn(),
    openApp: vi.fn(),
    paneCount: 2 as const,
    ...overrides,
  };
}

describe("HistoryApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state while the ticket data is missing", () => {
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx({ ticketData: null }));
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<HistoryApp />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByTestId("ticket-history")).not.toBeInTheDocument();
  });

  it("renders the history once ticket data is present", () => {
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<HistoryApp />);

    expect(screen.getByTestId("ticket-history")).toBeInTheDocument();
  });

  it("feeds restored content into the editor draft via onDraftChange (BRDG-440)", () => {
    const onDraftChange = vi.fn();
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx({ onDraftChange }));
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(makePaneCtx());

    render(<HistoryApp />);
    fireEvent.click(screen.getByTestId("trigger-restore"));

    expect(onDraftChange).toHaveBeenCalledWith("restored content");
  });

  it("registers the history toolbar on mount and unregisters on unmount", () => {
    const registerToolbar = vi.fn();
    const unregisterToolbar = vi.fn();
    (useWriterContext as ReturnType<typeof vi.fn>).mockReturnValue(makeWriterCtx());
    (usePaneContext as ReturnType<typeof vi.fn>).mockReturnValue(
      makePaneCtx({ registerToolbar, unregisterToolbar }),
    );

    const { unmount } = render(<HistoryApp />);
    expect(registerToolbar).toHaveBeenCalledWith("history", expect.objectContaining({ label: "History" }));

    unmount();
    expect(unregisterToolbar).toHaveBeenCalledWith("history");
  });
});
