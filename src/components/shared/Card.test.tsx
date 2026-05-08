import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies default variant classes", () => {
    const { container } = render(<Card>Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-border-strong");
    expect(el.className).toContain("bg-overlay-subtle");
  });

  it("applies subtle variant classes", () => {
    const { container } = render(<Card variant="subtle">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-border-subtle");
    expect(el.className).toContain("bg-overlay-subtle");
  });

  it("applies floating variant classes", () => {
    const { container } = render(<Card variant="floating">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-[var(--color-surface-floating)]");
    expect(el.className).toContain("shadow-");
  });

  it("applies dashed variant classes", () => {
    const { container } = render(<Card variant="dashed">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-dashed");
  });

  it("merges additional className", () => {
    const { container } = render(<Card className="p-4 mt-2">Content</Card>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("p-4");
    expect(el.className).toContain("mt-2");
  });

  it("passes through HTML attributes", () => {
    render(<Card data-testid="my-card">Content</Card>);
    expect(screen.getByTestId("my-card")).toBeInTheDocument();
  });
});
