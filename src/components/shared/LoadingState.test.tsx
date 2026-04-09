import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("renders default label", () => {
    render(<LoadingState />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders custom label", () => {
    render(<LoadingState label="Loading messages..." />);
    expect(screen.getByText("Loading messages...")).toBeInTheDocument();
  });

  it("has role=status", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders text variant by default", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders spinner variant with icon", () => {
    const { container } = render(<LoadingState variant="spinner" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("merges additional className", () => {
    const { container } = render(<LoadingState className="py-8" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("py-8");
  });
});
