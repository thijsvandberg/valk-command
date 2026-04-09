import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InlineAlert } from "./InlineAlert";

describe("InlineAlert", () => {
  it("renders children", () => {
    render(<InlineAlert variant="error">Something went wrong</InlineAlert>);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("has role=alert", () => {
    render(<InlineAlert variant="error">Error</InlineAlert>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("applies error variant classes", () => {
    const { container } = render(
      <InlineAlert variant="error">Error</InlineAlert>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-red-400");
    expect(el.className).toContain("bg-red-500/10");
  });

  it("applies warning variant classes", () => {
    const { container } = render(
      <InlineAlert variant="warning">Warning</InlineAlert>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-amber-400");
  });

  it("applies info variant classes", () => {
    const { container } = render(
      <InlineAlert variant="info">Info</InlineAlert>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-blue-400");
  });

  it("merges additional className", () => {
    const { container } = render(
      <InlineAlert variant="error" className="mx-4">
        Error
      </InlineAlert>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("mx-4");
  });
});
