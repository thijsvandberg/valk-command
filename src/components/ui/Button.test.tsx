import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("renders as a button element", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("applies ghost variant by default", () => {
    const { container } = render(<Button>Ghost</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-white/[0.02]");
  });

  it("applies primary variant classes", () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-[var(--color-brand-600)]");
  });

  it("applies secondary variant classes", () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-[var(--color-secondary-500)]/15");
  });

  it("applies soft variant classes", () => {
    const { container } = render(<Button variant="soft">Soft</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("bg-[var(--color-brand-500)]/10");
  });

  it("applies destructive variant classes", () => {
    const { container } = render(<Button variant="destructive">Delete</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-red-400/80");
  });

  it("applies dashed variant classes", () => {
    const { container } = render(<Button variant="dashed">Add</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-dashed");
  });

  it("applies sm size classes", () => {
    const { container } = render(<Button size="sm">Small</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-6");
    expect(el.className).toContain("text-[11px]");
  });

  it("applies md size classes by default", () => {
    const { container } = render(<Button>Medium</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-7");
  });

  it("applies lg size classes", () => {
    const { container } = render(<Button size="lg">Large</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-9");
  });

  it("renders icon only when iconOnly is true", () => {
    const { container } = render(
      <Button iconOnly icon={<span data-testid="icon">X</span>}>
        Hidden text
      </Button>,
    );
    const el = container.firstChild as HTMLElement;
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.queryByText("Hidden text")).not.toBeInTheDocument();
    // iconOnly uses square size classes
    expect(el.className).toContain("w-7");
  });

  it("renders icon alongside text when not iconOnly", () => {
    render(
      <Button icon={<span data-testid="icon">X</span>}>Label</Button>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Label")).toBeInTheDocument();
  });

  it("calls onClick handler", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("merges additional className", () => {
    const { container } = render(<Button className="w-full">Full</Button>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-full");
  });

  it("passes through HTML button attributes", () => {
    render(<Button type="submit" data-testid="my-btn">Submit</Button>);
    const btn = screen.getByTestId("my-btn");
    expect(btn).toHaveAttribute("type", "submit");
  });
});
