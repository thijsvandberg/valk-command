import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>5</Badge>);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("applies default variant classes", () => {
    const { container } = render(<Badge>3</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-overlay-default");
    expect(el.className).toContain("text-text-tertiary");
  });

  it("applies brand variant classes", () => {
    const { container } = render(<Badge variant="brand">2</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-brand-400)]");
  });

  it("applies success variant classes from status tokens", () => {
    const { container } = render(<Badge variant="success">1</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-success)]");
  });

  it("applies warning variant classes from status tokens", () => {
    const { container } = render(<Badge variant="warning">!</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-warning)]");
  });

  it("applies danger variant classes from status tokens", () => {
    const { container } = render(<Badge variant="danger">9+</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-error)]");
  });

  // BRDG-419 guard: no raw status-palette utilities in any variant.
  it("uses no raw red/amber/emerald/green palette utilities", () => {
    for (const variant of ["default", "brand", "success", "warning", "danger"] as const) {
      const { container } = render(<Badge variant={variant}>x</Badge>);
      const cls = (container.firstChild as HTMLElement).className;
      expect(cls).not.toMatch(/(?:bg|text|border)-(?:red|amber|emerald|green)-\d/);
    }
  });

  it("applies sm size classes", () => {
    const { container } = render(<Badge size="sm">1</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("text-caption");
  });

  it("applies md size classes by default", () => {
    const { container } = render(<Badge>1</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-5");
  });

  it("renders as rounded-full", () => {
    const { container } = render(<Badge>1</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("rounded-full");
  });

  it("merges additional className", () => {
    const { container } = render(<Badge className="absolute -top-1">2</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("absolute");
  });

  it("passes through HTML attributes", () => {
    render(<Badge data-testid="my-badge">7</Badge>);
    expect(screen.getByTestId("my-badge")).toBeInTheDocument();
  });
});
