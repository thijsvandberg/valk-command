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

  it("does not render inline send buttons when onSend is omitted", () => {
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
    expect(screen.queryByRole("button", { name: /Send "Review" now/ })).not.toBeInTheDocument();
  });

  it("renders an inline send button for sendable actions when onSend is provided", () => {
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={() => {}}
        onSend={() => {}}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    expect(screen.getByRole("button", { name: 'Send "Review" now' })).toBeInTheDocument();
    // Disabled action has no sendable prompt -> no send button.
    expect(
      screen.queryByRole("button", { name: 'Send "Coming soon" now' })
    ).not.toBeInTheDocument();
  });

  it("inline send calls onSend (not onSelect) and does not fill the input", () => {
    const onSelect = vi.fn();
    const onSend = vi.fn();
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={onSelect}
        onSend={onSend}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: 'Send "Review" now' }));
    expect(onSend).toHaveBeenCalledWith("Review this", "review");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking the label still calls onSelect even when onSend is provided", () => {
    const onSelect = vi.fn();
    const onSend = vi.fn();
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={onSelect}
        onSend={onSend}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    fireEvent.click(screen.getByText("Review"));
    expect(onSelect).toHaveBeenCalledWith("Review this", "review");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("hides the inline send button for actions flagged sendable: false", () => {
    const onSend = vi.fn();
    render(
      <QuickActionsPopover
        actions={[
          { id: "panel", label: "Find Related", icon: Search, prompt: "Find related", enabled: true, sendable: false },
        ]}
        onSelect={() => {}}
        onSend={onSend}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled={false}
      />
    );
    expect(
      screen.queryByRole("button", { name: 'Send "Find Related" now' })
    ).not.toBeInTheDocument();
  });

  it("disables inline send and blocks onSend when the popover is busy", () => {
    const onSend = vi.fn();
    render(
      <QuickActionsPopover
        actions={ACTIONS}
        onSelect={() => {}}
        onSend={onSend}
        open
        onToggle={() => {}}
        onClose={() => {}}
        disabled
      />
    );
    const sendBtn = screen.getByRole("button", { name: 'Send "Review" now' });
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn);
    expect(onSend).not.toHaveBeenCalled();
  });
});
