import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { SubtasksPaneResizable } from "./SubtasksPaneResizable";

beforeAll(() => {
  // Wide viewport so the max-width clamp does not interfere with delta assertions.
  Object.defineProperty(window, "innerWidth", { value: 2000, configurable: true });
});

function setup(zoom: number, startWidth = 400) {
  const onWidthChange = vi.fn();
  const { container } = render(
    <SubtasksPaneResizable width={startWidth} onWidthChange={onWidthChange} zoom={zoom}>
      <div>content</div>
    </SubtasksPaneResizable>,
  );
  const handle = container.querySelector(".cursor-col-resize") as HTMLElement;
  return { handle, onWidthChange };
}

describe("SubtasksPaneResizable", () => {
  it("widens by the raw cursor delta at 100% zoom", () => {
    const { handle, onWidthChange } = setup(1);

    fireEvent.mouseDown(handle, { clientX: 1000 });
    // Drag left-edge handle leftward by 100px -> pane gets 100px wider.
    fireEvent.mouseMove(document, { clientX: 900 });

    expect(onWidthChange).toHaveBeenLastCalledWith(500);
  });

  it("divides the cursor delta by the zoom factor at 120% zoom", () => {
    const { handle, onWidthChange } = setup(1.2);

    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(document, { clientX: 880 });

    // 120px of visual cursor travel maps to 120 / 1.2 = 100 layout px.
    expect(onWidthChange).toHaveBeenLastCalledWith(500);
  });

  it("clamps to the minimum pane width", () => {
    const { handle, onWidthChange } = setup(1);

    fireEvent.mouseDown(handle, { clientX: 1000 });
    // Drag far right (narrowing) past the 320px floor.
    fireEvent.mouseMove(document, { clientX: 1500 });

    expect(onWidthChange).toHaveBeenLastCalledWith(320);
  });
});
