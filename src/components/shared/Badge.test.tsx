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
    expect(el.className).toContain("bg-white/[0.06]");
    expect(el.className).toContain("text-white/40");
  });

  it("applies brand variant classes", () => {
    const { container } = render(<Badge variant="brand">2</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-brand-400)]");
  });

  it("applies success variant classes", () => {
    const { container } = render(<Badge variant="success">1</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-emerald-400");
  });

  it("applies warning variant classes", () => {
    const { container } = render(<Badge variant="warning">!</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-amber-400");
  });

  it("applies danger variant classes", () => {
    const { container } = render(<Badge variant="danger">9+</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-red-400");
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
