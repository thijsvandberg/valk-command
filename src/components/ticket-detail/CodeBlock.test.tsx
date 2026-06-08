import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { CodeBlock } from "./CodeBlock";

const LINES = ["const a = 1;", "const b = 2;", "const c = 3;"];

function renderBlock(overrides: Partial<React.ComponentProps<typeof CodeBlock>> = {}) {
  return render(
    <CodeBlock
      lang="js"
      highlightedLines={LINES}
      lineCount={LINES.length}
      defaultCollapsed={false}
      {...overrides}
    />,
  );
}

// The code grid carries the rm-code-content cells; absence == collapsed.
const codeCells = (c: HTMLElement) => c.querySelectorAll(".rm-code-content");

describe("CodeBlock", () => {
  it("renders the code grid when expanded (default for short blocks)", () => {
    const { container } = renderBlock({ defaultCollapsed: false });
    expect(codeCells(container)).toHaveLength(LINES.length);
    expect(container.textContent).toContain("const a = 1;");
  });

  it("starts collapsed when defaultCollapsed is true (long blocks)", () => {
    const { container } = renderBlock({ defaultCollapsed: true });
    expect(codeCells(container)).toHaveLength(0);
  });

  it("shows a language + line-count summary while collapsed", () => {
    const { container } = renderBlock({ defaultCollapsed: true });
    expect(container.textContent).toContain("JS · 3 lines");
  });

  it("singularizes the summary for a one-line block", () => {
    const { container } = render(
      <CodeBlock lang="" highlightedLines={["x"]} lineCount={1} defaultCollapsed={true} />,
    );
    expect(container.textContent).toContain("Code · 1 line");
  });

  it("toggles expand and collapse on click in both directions", () => {
    const { container } = renderBlock({ defaultCollapsed: false });
    const toggle = screen.getByRole("button");

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(codeCells(container)).toHaveLength(LINES.length);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(codeCells(container)).toHaveLength(0);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(codeCells(container)).toHaveLength(LINES.length);
  });
});
