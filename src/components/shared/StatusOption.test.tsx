import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusOption } from "./StatusOption";

describe("StatusOption", () => {
  it("renders a standard status as a badge", () => {
    render(<StatusOption value="TO DO" />);
    expect(screen.getByText("TO DO")).toBeInTheDocument();
  });

  it("renders the DELETED state with a strikethrough", () => {
    render(<StatusOption value="DELETED" />);
    const el = screen.getByText("DELETED");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("line-through");
  });
});
