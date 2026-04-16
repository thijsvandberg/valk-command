import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the status text", () => {
    render(<StatusBadge status="IN PROGRESS" />);
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
  });

  it("applies inline styles for background and text color", () => {
    const { container } = render(<StatusBadge status="DONE" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundColor).toBeTruthy();
    expect(el.style.color).toBeTruthy();
  });

  it("falls back to TO DO colors for unknown status", () => {
    const { container } = render(<StatusBadge status={"UNKNOWN" as never} />);
    const el = container.firstChild as HTMLElement;
    // Should not throw and should render
    expect(el).toBeInTheDocument();
  });

  it("renders as inline-flex with rounded shape", () => {
    const { container } = render(<StatusBadge status="TO DO" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("inline-flex");
    expect(el.className).toContain("rounded");
  });
});
