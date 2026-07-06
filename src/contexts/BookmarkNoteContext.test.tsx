import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BookmarkNoteProvider, useBookmarkNoteCapture } from "./BookmarkNoteContext";

// The card is dynamically imported; stub next/dynamic with a component that reflects
// the ticketKeys so we can assert the provider mounts it on demand.
vi.mock("next/dynamic", () => ({
  default: () => {
    const CardStub = ({ ticketKeys }: { ticketKeys: string[] }) => (
      <div data-testid="note-card">{ticketKeys.join(",")}</div>
    );
    return CardStub;
  },
}));

function Consumer({ target }: { target: string | string[] }) {
  const { captureBookmarkNote } = useBookmarkNoteCapture();
  return (
    <button type="button" onClick={() => captureBookmarkNote(target)}>
      capture
    </button>
  );
}

describe("BookmarkNoteProvider", () => {
  it("mounts the capture card only after captureBookmarkNote is called", () => {
    render(
      <BookmarkNoteProvider>
        <Consumer target="VPL-42" />
      </BookmarkNoteProvider>,
    );
    expect(screen.queryByTestId("note-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "capture" }));
    const card = screen.getByTestId("note-card");
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent("VPL-42");
  });

  it("passes every key through for a bulk capture (one card for all)", () => {
    render(
      <BookmarkNoteProvider>
        <Consumer target={["VPL-1", "VPL-2", "VPL-3"]} />
      </BookmarkNoteProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "capture" }));
    expect(screen.getByTestId("note-card")).toHaveTextContent("VPL-1,VPL-2,VPL-3");
  });

  it("defaults to a no-op when a consumer is rendered outside the provider", () => {
    expect(() => {
      render(<Consumer target="VPL-42" />);
      fireEvent.click(screen.getByRole("button", { name: "capture" }));
    }).not.toThrow();
  });
});
