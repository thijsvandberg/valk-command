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

  it("applies error variant classes from status tokens", () => {
    const { container } = render(
      <InlineAlert variant="error">Error</InlineAlert>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-error)]");
    expect(el.className).toContain("bg-[var(--color-status-error-subtle)]");
  });

  it("applies warning variant classes from status tokens", () => {
    const { container } = render(
      <InlineAlert variant="warning">Warning</InlineAlert>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-warning)]");
  });

  it("applies info variant classes from status tokens", () => {
    const { container } = render(
      <InlineAlert variant="info">Info</InlineAlert>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-[var(--color-status-info)]");
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

  // BRDG-419 guard: the shared primitive must not re-introduce raw status-palette
  // utilities; all status color comes from the --color-status-* tokens.
  it("uses no raw red/amber/emerald/green palette utilities", () => {
    for (const variant of ["error", "warning", "info"] as const) {
      const { container } = render(
        <InlineAlert variant={variant}>x</InlineAlert>,
      );
      const cls = (container.firstChild as HTMLElement).className;
      expect(cls).not.toMatch(/(?:bg|text|border)-(?:red|amber|emerald|green)-\d/);
    }
  });
});
