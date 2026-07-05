import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookmarkBadge } from "./BookmarkBadge";

describe("BookmarkBadge", () => {
  it("renders the bookmark marker when bookmarked", () => {
    render(<BookmarkBadge bookmarked />);
    expect(screen.getByLabelText("Bookmarked")).toBeInTheDocument();
  });

  it("renders nothing when not bookmarked", () => {
    const { container } = render(<BookmarkBadge bookmarked={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when bookmarked is undefined", () => {
    const { container } = render(<BookmarkBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
