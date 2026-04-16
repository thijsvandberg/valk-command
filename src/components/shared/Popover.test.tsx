import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Popover, useClickOutside } from "./Popover";
import { useRef } from "react";

describe("Popover", () => {
  it("renders nothing when closed", () => {
    render(
      <Popover open={false} onClose={() => {}}>
        <div>Menu</div>
      </Popover>,
    );
    expect(screen.queryByText("Menu")).not.toBeInTheDocument();
  });

  it("renders children when open", () => {
    render(
      <div style={{ position: "relative" }}>
        <Popover open={true} onClose={() => {}}>
          <div>Menu</div>
        </Popover>
      </div>,
    );
    expect(screen.getByText("Menu")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <div style={{ position: "relative" }}>
        <Popover open={true} onClose={onClose}>
          <div>Menu</div>
        </Popover>
      </div>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies right alignment by default", () => {
    const { container } = render(
      <div style={{ position: "relative" }}>
        <Popover open={true} onClose={() => {}}>
          <div>Menu</div>
        </Popover>
      </div>,
    );
    const panel = container.querySelector(".absolute.top-full") as HTMLElement;
    expect(panel.className).toContain("right-0");
  });

  it("applies left alignment when align=left", () => {
    const { container } = render(
      <div style={{ position: "relative" }}>
        <Popover open={true} onClose={() => {}} align="left">
          <div>Menu</div>
        </Popover>
      </div>,
    );
    const panel = container.querySelector(".absolute.top-full") as HTMLElement;
    expect(panel.className).toContain("left-0");
  });

  it("merges additional className", () => {
    const { container } = render(
      <div style={{ position: "relative" }}>
        <Popover open={true} onClose={() => {}} className="w-64">
          <div>Menu</div>
        </Popover>
      </div>,
    );
    const panel = container.querySelector(".absolute.top-full") as HTMLElement;
    expect(panel.className).toContain("w-64");
  });
});

describe("useClickOutside", () => {
  it("calls onClose when clicking outside the ref element", () => {
    const onClose = vi.fn();
    function TestComponent() {
      const ref = useRef<HTMLDivElement>(null);
      useClickOutside(ref, onClose);
      return (
        <div>
          <div ref={ref} data-testid="inside">Inside</div>
          <div data-testid="outside">Outside</div>
        </div>
      );
    }
    render(<TestComponent />);
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the ref element", () => {
    const onClose = vi.fn();
    function TestComponent() {
      const ref = useRef<HTMLDivElement>(null);
      useClickOutside(ref, onClose);
      return <div ref={ref} data-testid="inside">Inside</div>;
    }
    render(<TestComponent />);
    fireEvent.mouseDown(screen.getByTestId("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
