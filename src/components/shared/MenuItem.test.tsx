import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MenuItem, MenuList } from "./MenuItem";

describe("MenuItem", () => {
  it("renders children and an icon slot", () => {
    render(<MenuItem icon={<svg data-testid="icon" />}>Pin</MenuItem>);
    expect(screen.getByText("Pin")).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("carries the canonical hover / active-press / focus-visible classes", () => {
    render(<MenuItem>Item</MenuItem>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("hover:bg-hover-list-item");
    expect(el.className).toContain("active:bg-overlay-default");
    expect(el.className).toContain("focus-visible:outline-2");
    expect(el.className).toContain("focus-visible:outline-[var(--color-brand-400)]");
  });

  it("renders a button by default and fires onClick", () => {
    const onClick = vi.fn();
    render(<MenuItem onClick={onClick}>Go</MenuItem>);
    const el = screen.getByRole("button");
    expect(el.tagName).toBe("BUTTON");
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an anchor when href is provided", () => {
    render(<MenuItem href="/tickets/ABC-1">Open</MenuItem>);
    const el = screen.getByRole("link");
    expect(el.tagName).toBe("A");
    expect(el).toHaveAttribute("href", "/tickets/ABC-1");
    expect(el.className).toContain("focus-visible:outline-2");
  });

  it("applies the danger tone", () => {
    render(<MenuItem tone="danger">Delete</MenuItem>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("text-[var(--color-status-error)]");
  });

  it("marks an active row", () => {
    render(<MenuItem active>Current</MenuItem>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("font-medium");
    expect(el.className).toContain("text-text-primary");
  });

  it("supports disabled", () => {
    const onClick = vi.fn();
    render(<MenuItem disabled onClick={onClick}>Nope</MenuItem>);
    const el = screen.getByRole("button") as HTMLButtonElement;
    expect(el.disabled).toBe(true);
    expect(el.className).toContain("disabled:opacity-40");
  });

  it("forwards a caller-supplied role and data-testid", () => {
    render(
      <MenuItem role="menuitem" data-testid="row">
        X
      </MenuItem>,
    );
    const el = screen.getByTestId("row");
    expect(el).toHaveAttribute("role", "menuitem");
  });

  it("uses no raw status-palette utilities", () => {
    const { container } = render(<MenuItem tone="danger">x</MenuItem>);
    const cls = (container.firstChild as HTMLElement).className;
    expect(cls).not.toMatch(/(?:bg|text|border)-(?:red|amber|emerald|green)-\d/);
  });
});

describe("MenuList", () => {
  it("renders the floating-panel frame and merges className", () => {
    const { container } = render(
      <MenuList className="absolute right-0 z-dropdown">
        <MenuItem>A</MenuItem>
      </MenuList>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("shadow-popover");
    expect(el.className).toContain("bg-surface-floating");
    expect(el.className).toContain("absolute");
  });
});
