import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Tooltip } from "./Tooltip";

// jsdom performs no layout; mock floating-ui to assert the positioning contract.
vi.mock("@floating-ui/dom", () => ({
  computePosition: vi.fn(() =>
    Promise.resolve({ x: 55, y: 66, placement: "bottom", strategy: "fixed", middlewareData: {} }),
  ),
  autoUpdate: vi.fn((_ref: unknown, _panel: unknown, update: () => void) => {
    update();
    return vi.fn();
  }),
  offset: vi.fn((value: number) => ({ name: "offset", options: value })),
  flip: vi.fn(() => ({ name: "flip" })),
  shift: vi.fn((options: unknown) => ({ name: "shift", options })),
  size: vi.fn((options: unknown) => ({ name: "size", options })),
}));

describe("Tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("shows the content after the hover delay, portaled to body on the tooltip layer", () => {
    render(
      <Tooltip content="Explains the thing" delay={400}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByText("Trigger").parentElement!);
    expect(screen.queryByText("Explains the thing")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    const bubble = screen.getByText("Explains the thing");
    expect(bubble.parentElement).toBe(document.body);
    expect(bubble.style.zIndex).toBe("var(--z-tooltip)");
  });

  it("cancels a pending show and hides on mouse leave", () => {
    render(
      <Tooltip content="Explains the thing" delay={400}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.mouseEnter(wrapper);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.mouseLeave(wrapper);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByText("Explains the thing")).toBeNull();
  });

  it("shows on keyboard focus and hides on blur", () => {
    render(
      <Tooltip content="Explains the thing" delay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const wrapper = screen.getByText("Trigger").parentElement!;
    fireEvent.focus(wrapper);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByText("Explains the thing")).toBeInTheDocument();
    fireEvent.blur(wrapper);
    expect(screen.queryByText("Explains the thing")).toBeNull();
  });
});
