import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabBar, Tab, TabLink } from "./TabBar";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock("./BarContainer", () => ({
  BarContainer: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="bar-container" className={className}>{children}</div>
  ),
}));

describe("TabBar", () => {
  it("renders children inside BarContainer", () => {
    render(<TabBar><span>child</span></TabBar>);
    expect(screen.getByTestId("bar-container")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
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
});
