import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Popover } from "./Popover";

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
