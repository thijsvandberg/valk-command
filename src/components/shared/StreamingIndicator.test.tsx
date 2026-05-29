import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StreamingIndicator } from "./StreamingIndicator";

describe("StreamingIndicator", () => {
  it("renders the progress text", () => {
    render(<StreamingIndicator text="Reading files..." />);
    expect(screen.getByText("Reading files...")).toBeInTheDocument();
  });

  it("renders the pulsing dot indicator", () => {
    render(<StreamingIndicator text="Working" />);
    const root = screen.getByTestId("streaming-indicator");
    expect(root.querySelector(".animate-ping")).toBeInTheDocument();
  });

  it("applies an extra className to the root", () => {
    render(<StreamingIndicator text="Working" className="pl-4 flex-1" />);
    expect(screen.getByTestId("streaming-indicator").className).toContain("pl-4");
  });
});
