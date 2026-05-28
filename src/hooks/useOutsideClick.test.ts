import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOutsideClick } from "./useOutsideClick";

function createRef(el: HTMLElement | null = null) {
  return { current: el };
}

describe("useOutsideClick", () => {
  let container: HTMLDivElement;
  let inside: HTMLDivElement;
  let outside: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    inside = document.createElement("div");
    outside = document.createElement("div");
    container.appendChild(inside);
    document.body.appendChild(container);
    document.body.appendChild(outside);
  });

  afterEach(() => {
    document.body.removeChild(container);
    document.body.removeChild(outside);
  });

  it("calls onClose on mousedown outside the ref", () => {
    const onClose = vi.fn();
    renderHook(() => useOutsideClick(createRef(container), onClose));

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on mousedown inside the ref", () => {
    const onClose = vi.fn();
    renderHook(() => useOutsideClick(createRef(container), onClose));

    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles multiple refs - inside any ref counts as inside", () => {
    const second = document.createElement("div");
    document.body.appendChild(second);

    const onClose = vi.fn();
    renderHook(() =>
      useOutsideClick([createRef(container), createRef(second)], onClose),
    );

    // Click inside second ref - should not close
    second.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    // Click inside first ref - should not close
    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    // Click outside both - should close
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);

    document.body.removeChild(second);
  });

  it("does nothing when enabled is false", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useOutsideClick(createRef(container), onClose, { enabled: false }),
    );

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape key by default", () => {
    const onClose = vi.fn();
    renderHook(() => useOutsideClick(createRef(container), onClose));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on Escape when escapeClose is false", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useOutsideClick(createRef(container), onClose, { escapeClose: false }),
    );

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores non-Escape keys", () => {
    const onClose = vi.fn();
    renderHook(() => useOutsideClick(createRef(container), onClose));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up listeners on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() =>
      useOutsideClick(createRef(container), onClose),
    );

    unmount();

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
