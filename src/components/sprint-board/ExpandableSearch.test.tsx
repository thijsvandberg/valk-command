import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ExpandableSearch } from "./ExpandableSearch";

describe("ExpandableSearch - result count (BRDG-345)", () => {
  it("shows the count when a query of 2+ chars is active", () => {
    render(<ExpandableSearch value="heartbeat" onChange={() => {}} count={{ matched: 7, total: 21 }} />);
    expect(screen.getByText("7 of 21")).toBeInTheDocument();
  });

  it("hides the count for a sub-2-char query", () => {
    render(<ExpandableSearch value="h" onChange={() => {}} count={{ matched: 0, total: 21 }} />);
    expect(screen.queryByText(/of 21/)).not.toBeInTheDocument();
  });

  it("hides the count when none is provided", () => {
    render(<ExpandableSearch value="heartbeat" onChange={() => {}} />);
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument();
  });

  it("renders only the collapsed search button when empty", () => {
    render(<ExpandableSearch value="" onChange={() => {}} count={{ matched: 0, total: 21 }} />);
    // Collapsed: the input is not rendered, so neither is the count.
    expect(screen.queryByPlaceholderText("Search tickets...")).not.toBeInTheDocument();
    expect(screen.queryByText(/of 21/)).not.toBeInTheDocument();
  });
});
