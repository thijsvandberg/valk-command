import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  it("renders a textarea element", () => {
    render(<TextArea placeholder="Enter text..." />);
    expect(screen.getByPlaceholderText("Enter text...")).toBeInTheDocument();
  });

  it("merges additional className", () => {
    render(<TextArea className="resize-none" placeholder="Text" />);
    const el = screen.getByPlaceholderText("Text");
    expect(el.className).toContain("resize-none");
  });

  it("passes through HTML attributes", () => {
    render(<TextArea rows={3} data-testid="ta" placeholder="Text" />);
    expect(screen.getByTestId("ta")).toHaveAttribute("rows", "3");
  });
});
