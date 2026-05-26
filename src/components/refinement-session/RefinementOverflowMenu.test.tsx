import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RefinementOverflowMenu } from "./RefinementOverflowMenu";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("RefinementOverflowMenu", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("renders the trigger button", () => {
    render(<RefinementOverflowMenu />);
    expect(screen.getByTestId("refinement-overflow-trigger")).toBeInTheDocument();
  });

  it("opens menu on click and shows Past refinements link", () => {
    render(<RefinementOverflowMenu />);

    fireEvent.click(screen.getByTestId("refinement-overflow-trigger"));

    expect(screen.getByTestId("refinement-overflow-menu")).toBeInTheDocument();
    expect(screen.getByText("Past refinements")).toBeInTheDocument();
    expect(screen.getByText("Past refinements").closest("a")).toHaveAttribute("href", "/refinement/history");
  });

  it("closes menu on second click (toggle)", () => {
    render(<RefinementOverflowMenu />);
    const trigger = screen.getByTestId("refinement-overflow-trigger");

    fireEvent.click(trigger);
    expect(screen.getByTestId("refinement-overflow-menu")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByTestId("refinement-overflow-menu")).not.toBeInTheDocument();
  });

  it("closes menu on Escape key", () => {
    render(<RefinementOverflowMenu />);

    fireEvent.click(screen.getByTestId("refinement-overflow-trigger"));
    expect(screen.getByTestId("refinement-overflow-menu")).toBeInTheDocument();

    // Advance past the deferred setTimeout so the keydown listener attaches
    act(() => { vi.runAllTimers(); });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("refinement-overflow-menu")).not.toBeInTheDocument();
  });
});
