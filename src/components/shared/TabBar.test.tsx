import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabBar, Tab, TabLink } from "./TabBar";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("./BarContainer", () => ({
  BarContainer: ({ children, className, role }: { children: React.ReactNode; className?: string; role?: string }) => (
    <div data-testid="bar-container" role={role} className={className}>{children}</div>
  ),
}));

describe("TabBar", () => {
  it("renders children inside BarContainer", () => {
    render(<TabBar><span>child</span></TabBar>);
    expect(screen.getByTestId("bar-container")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("exposes the tablist role (BRDG-425)", () => {
    render(<TabBar><Tab active label="A" onClick={vi.fn()} /></TabBar>);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});

describe("Tab", () => {
  it("renders label", () => {
    render(<Tab active={false} label="Overview" onClick={vi.fn()} />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Tab active={false} label="Details" onClick={onClick} />);
    fireEvent.click(screen.getByText("Details"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders badge when provided", () => {
    render(<Tab active={false} label="Issues" badge={42} onClick={vi.fn()} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("does not render badge when undefined", () => {
    render(<Tab active={false} label="Issues" onClick={vi.fn()} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<Tab active={false} label="Home" icon={<span data-testid="icon" />} onClick={vi.fn()} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("exposes role=tab and reflects selection via aria-selected (BRDG-425)", () => {
    const { rerender } = render(<Tab active label="Overview" onClick={vi.fn()} />);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Overview");
    rerender(<Tab active={false} label="Overview" onClick={vi.fn()} />);
    expect(screen.getByRole("tab", { selected: false })).toBeInTheDocument();
  });
});

describe("TabLink", () => {
  it("renders as a link with correct href", () => {
    render(<TabLink active={false} label="Sprint" href="/sprint" />);
    const link = screen.getByText("Sprint").closest("a");
    expect(link).toHaveAttribute("href", "/sprint");
  });

  it("renders badge with highlight styling", () => {
    render(<TabLink active={false} label="Alerts" badge={3} badgeHighlight href="/alerts" />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("exposes role=tab + aria-selected (BRDG-425)", () => {
    render(<TabLink active label="Sprint" href="/sprint" />);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Sprint");
  });
});
