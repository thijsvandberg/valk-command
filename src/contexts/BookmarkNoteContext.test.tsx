import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BookmarkNoteProvider, useBookmarkNoteCapture } from "./BookmarkNoteContext";

// The card is dynamically imported; stub next/dynamic with a component that reflects
// the ticketKey so we can assert the provider mounts it on demand.
vi.mock("next/dynamic", () => ({
  default: () => {
    const CardStub = ({ ticketKey }: { ticketKey: string }) => (
      <div data-testid="note-card">{ticketKey}</div>
    );
    return CardStub;
  },
}));

function Consumer() {
  const { captureBookmarkNote } = useBookmarkNoteCapture();
  return (
    <button type="button" onClick={() => captureBookmarkNote("VPL-42")}>
      capture
    </button>
  );
}

describe("BookmarkNoteProvider", () => {
  it("mounts the capture card only after captureBookmarkNote is called", () => {
    render(
      <BookmarkNoteProvider>
        <Consumer />
      </BookmarkNoteProvider>,
    );
    expect(screen.queryByTestId("note-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "capture" }));
    const card = screen.getByTestId("note-card");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("VPL-42");
  });

  it("defaults to a no-op when a consumer is rendered outside the provider", () => {
    expect(() => {
      render(<Consumer />);
      fireEvent.click(screen.getByRole("button", { name: "capture" }));
    }).not.toThrow();
  });
});
