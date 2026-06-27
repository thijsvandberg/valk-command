import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders children", () => {
    render(<Tag>Draft</Tag>);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("applies neutral color by default", () => {
    const { container } = render(<Tag>Label</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-overlay-default");
    expect(el.className).toContain("text-text-tertiary");
  });

  it("applies brand color", () => {
    const { container } = render(<Tag color="brand">Jira</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-brand-400)]");
  });

  it("applies blue color from the info status token", () => {
    const { container } = render(<Tag color="blue">Draft</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-info)]");
  });

  it("applies purple color from the icon-epic token", () => {
    const { container } = render(<Tag color="purple">AI</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-icon-epic)]");
  });

  it("applies amber color from the warning status token", () => {
    const { container } = render(<Tag color="amber">Outdated</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-warning)]");
  });

  it("applies red color from the error status token", () => {
    const { container } = render(<Tag color="red">Removed</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-error)]");
  });

  // BRDG-419 guard: no raw Tailwind palette utilities in any color.
  it("uses no raw red/amber/emerald/green/blue/purple palette utilities", () => {
    for (const color of ["brand", "blue", "purple", "amber", "red", "neutral"] as const) {
      const { container } = render(<Tag color={color}>x</Tag>);
      const cls = (container.firstChild as HTMLElement).className;
      expect(cls).not.toMatch(/(?:bg|text|border)-(?:red|amber|emerald|green|blue|purple)-\d/);
    }
  });

  it("merges additional className", () => {
    const { container } = render(<Tag className="ml-2">Tag</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("ml-2");
  });

  it("passes through HTML attributes", () => {
    render(<Tag data-testid="my-tag">Tag</Tag>);
    expect(screen.getByTestId("my-tag")).toBeInTheDocument();
  });
});
