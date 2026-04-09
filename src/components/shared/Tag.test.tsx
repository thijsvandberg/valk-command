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
    expect(el.className).toContain("bg-white/[0.06]");
    expect(el.className).toContain("text-white/40");
  });

  it("applies brand color", () => {
    const { container } = render(<Tag color="brand">Jira</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-brand-400)]");
  });

  it("applies blue color", () => {
    const { container } = render(<Tag color="blue">Draft</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-blue-400");
  });

  it("applies purple color", () => {
    const { container } = render(<Tag color="purple">AI</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-purple-400");
  });

  it("applies amber color", () => {
    const { container } = render(<Tag color="amber">Outdated</Tag>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-amber-400");
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
