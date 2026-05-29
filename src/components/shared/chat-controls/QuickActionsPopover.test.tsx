import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Star, Search } from "lucide-react";
import { QuickActionsPopover, type QuickAction } from "./QuickActionsPopover";

const ACTIONS: QuickAction[] = [
  { id: "review", label: "Review", icon: Star, prompt: "Review this", enabled: true },
  { id: "soon", label: "Coming soon", icon: Search, prompt: "", enabled: false },
];

describe("QuickActionsPopover", () => {
  it("does not render the action list when closed", () => {
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={() => {}}
        open={false}
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("renders actions when open", () => {
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={() => {}}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText("soon")).toBeInTheDocument();
  });

  it("calls onToggle when the trigger is clicked", () => {
    const onToggle = vi.fn();
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={() => {}}
        open={false}
        onToggle={onToggle}
        onClose={() => {}}
        disabled={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "AI actions" }));
    expect(onToggle).toHaveBeenCalled();
  });

  it("calls onSelect with prompt and id for enabled actions", () => {
    const onSelect = vi.fn();
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={onSelect}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    fireEvent.click(screen.getByText("Review"));
    expect(onSelect).toHaveBeenCalledWith("Review this", "review");
  });

  it("does not call onSelect for disabled actions", () => {
    const onSelect = vi.fn();
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={onSelect}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    fireEvent.click(screen.getByText("Coming soon"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
