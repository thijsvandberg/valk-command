import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}}>
        <div>Content</div>
      </Modal>,
    );
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });

  it("renders children when open", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <div>Content</div>
      </Modal>,
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <div>Content</div>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open={true} onClose={onClose}>
        <div>Content</div>
      </Modal>,
    );
    // The backdrop is the portal div rendered in document.body
    const backdrop = container.ownerDocument.querySelector(
      ".fixed.inset-0.z-50",
    ) as HTMLElement;
    if (backdrop) {
      fireEvent.mouseDown(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it("does not call onClose when content is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <div data-testid="content">Content</div>
      </Modal>,
    );
    fireEvent.mouseDown(screen.getByTestId("content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies center alignment by default", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <div>Content</div>
      </Modal>,
    );
    const backdrop = document.querySelector(".fixed.inset-0.z-50") as HTMLElement;
    expect(backdrop.className).toContain("items-center");
  });

  it("applies top alignment when position=top", () => {
    render(
      <Modal open={true} onClose={() => {}} position="top">
        <div>Content</div>
      </Modal>,
    );
    const backdrop = document.querySelector(".fixed.inset-0.z-50") as HTMLElement;
    expect(backdrop.className).toContain("items-start");
  });

  it("has role=dialog and aria-modal when open", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <div>Content</div>
      </Modal>,
    );
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("traps Tab key within focusable elements", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <div>
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </div>
      </Modal>,
    );
    const buttons = screen.getAllByRole("button");
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("traps Shift+Tab key within focusable elements", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <div>
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </div>
      </Modal>,
    );
    const buttons = screen.getAllByRole("button");
    buttons[0].focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("restores focus to previously focused element on close", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <Modal open={true} onClose={() => {}}>
        <button>Inside</button>
      </Modal>,
    );

    rerender(
      <Modal open={false} onClose={() => {}}>
        <button>Inside</button>
      </Modal>,
    );

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
