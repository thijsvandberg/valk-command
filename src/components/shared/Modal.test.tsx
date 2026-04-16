import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
});
