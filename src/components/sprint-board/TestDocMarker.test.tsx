import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TestDocMarker } from "./TestDocMarker";

describe("TestDocMarker (BRDG-426)", () => {
  it("renders the four states with their own testids", () => {
    render(<TestDocMarker state="accepted" onOpenReview={vi.fn()} />);
    expect(screen.getByTestId("test-doc-state-accepted")).toBeInTheDocument();

    render(<TestDocMarker state="draft" onOpenReview={vi.fn()} />);
    expect(screen.getByTestId("test-doc-state-draft")).toBeInTheDocument();

    render(<TestDocMarker state="not_needed" onOpenReview={vi.fn()} />);
    expect(screen.getByTestId("test-doc-state-not_needed")).toBeInTheDocument();

    render(<TestDocMarker state={null} onOpenReview={vi.fn()} />);
    expect(screen.getByTestId("test-doc-state-none")).toBeInTheDocument();
  });

  it("is a button that opens the review modal on click", () => {
    const onOpenReview = vi.fn();
    render(<TestDocMarker state="accepted" onOpenReview={onOpenReview} />);

    const marker = screen.getByTestId("test-doc-state-accepted");
    expect(marker.tagName).toBe("BUTTON");
    fireEvent.click(marker);
    expect(onOpenReview).toHaveBeenCalledTimes(1);
  });

  it("renders a plain (non-interactive) icon when no handler is supplied", () => {
    render(<TestDocMarker state="draft" />);
    expect(screen.getByTestId("test-doc-state-draft").tagName).toBe("SPAN");
  });
});
