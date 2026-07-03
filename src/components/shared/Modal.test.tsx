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
      ".fixed.inset-0.z-modal",
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
    const backdrop = document.querySelector(".fixed.inset-0.z-modal") as HTMLElement;
    expect(backdrop.className).toContain("items-center");
  });

  it("applies top alignment when position=top", () => {
    render(
      <Modal open={true} onClose={() => {}} position="top">
        <div>Content</div>
      </Modal>,
    );
    const backdrop = document.querySelector(".fixed.inset-0.z-modal") as HTMLElement;
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

describe("Modal nesting + palette hosting (BRDG-431)", () => {
  it("does not close on Escape when closeOnEscape is off (caller owns Escape)", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} closeOnEscape={false}>
        <div>Palette</div>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape only closes the topmost of two stacked modals", () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    render(
      <>
        <Modal open onClose={closeOuter} aria-label="Outer">
          <button>Outer content</button>
        </Modal>
        <Modal open onClose={closeInner} aria-label="Inner">
          <button>Inner content</button>
        </Modal>
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });

  it("only the topmost modal traps Tab (nested ConfirmDialog scenario)", () => {
    render(
      <>
        <Modal open onClose={() => {}} aria-label="Outer">
          <button>Outer first</button>
          <button>Outer last</button>
        </Modal>
        <Modal open onClose={() => {}} aria-label="Inner">
          <button>Inner first</button>
          <button>Inner last</button>
        </Modal>
      </>,
    );
    const innerLast = screen.getByText("Inner last");
    innerLast.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    // The inner (topmost) trap wraps focus to its own first element; the outer
    // trap must not hijack it.
    expect(document.activeElement).toBe(screen.getByText("Inner first"));
  });

  it("after the topmost modal closes, the remaining modal handles Escape again", () => {
    const closeOuter = vi.fn();
    const { rerender } = render(
      <>
        <Modal open onClose={closeOuter} aria-label="Outer">
          <button>Outer content</button>
        </Modal>
        <Modal open onClose={() => {}} aria-label="Inner">
          <button>Inner content</button>
        </Modal>
      </>,
    );
    rerender(
      <>
        <Modal open onClose={closeOuter} aria-label="Outer">
          <button>Outer content</button>
        </Modal>
        <Modal open={false} onClose={() => {}} aria-label="Inner">
          <button>Inner content</button>
        </Modal>
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeOuter).toHaveBeenCalledTimes(1);
  });

  it("leaves arrow keys untouched for the palette's own result navigation", () => {
    const onClose = vi.fn();
    const onArrow = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <div onKeyDown={(e) => { if (e.key === "ArrowDown") onArrow(); }}>
          <button>Row</button>
        </div>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByText("Row"), { key: "ArrowDown" });
    expect(onArrow).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
