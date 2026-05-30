import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useCornerSnap,
  cornerFromPoint,
  CORNER_STORAGE_KEY,
  DEFAULT_CORNER,
} from "./useCornerSnap";

const mockStorage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => Object.keys(mockStorage).forEach((k) => delete mockStorage[k]),
    },
    writable: true,
  });
  // Stable viewport for quadrant math.
  Object.defineProperty(window, "innerWidth", { value: 1000, writable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, writable: true });
});

// 32px button resting at top-right (top:12, left: 1000-12-32 = 956).
function makePointerDownEvent(overrides: Partial<{ clientX: number; clientY: number }> = {}) {
  const el = {
    getBoundingClientRect: () => ({ left: 956, top: 12, width: 32, height: 32 }),
    setPointerCapture: vi.fn(),
  };
  return {
    pointerType: "mouse",
    button: 0,
    pointerId: 1,
    clientX: overrides.clientX ?? 972,
    clientY: overrides.clientY ?? 28,
    currentTarget: el,
  } as unknown as React.PointerEvent;
}

function dispatchPointer(type: "pointermove" | "pointerup", clientX: number, clientY: number) {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
  window.dispatchEvent(event);
}

describe("cornerFromPoint", () => {
  it("resolves each quadrant to its corner", () => {
    expect(cornerFromPoint(100, 100, 1000, 800)).toBe("top-left");
    expect(cornerFromPoint(900, 100, 1000, 800)).toBe("top-right");
    expect(cornerFromPoint(100, 700, 1000, 800)).toBe("bottom-left");
    expect(cornerFromPoint(900, 700, 1000, 800)).toBe("bottom-right");
  });

  it("biases the exact center toward bottom-right", () => {
    expect(cornerFromPoint(500, 400, 1000, 800)).toBe("bottom-right");
  });
});

describe("useCornerSnap persistence", () => {
  it("defaults to top-right when storage is empty", () => {
    const { result } = renderHook(() => useCornerSnap({ enabled: true, onClick: vi.fn() }));
    expect(result.current.corner).toBe(DEFAULT_CORNER);
  });

  it("reads a previously persisted corner", () => {
    mockStorage[CORNER_STORAGE_KEY] = JSON.stringify("bottom-left");
    const { result } = renderHook(() => useCornerSnap({ enabled: true, onClick: vi.fn() }));
    expect(result.current.corner).toBe("bottom-left");
  });
});

describe("useCornerSnap click vs drag", () => {
  it("treats a press with no movement as a click and exits", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useCornerSnap({ enabled: true, onClick }));

    act(() => {
      result.current.handlers.onPointerDown(makePointerDownEvent());
    });
    act(() => {
      dispatchPointer("pointerup", 972, 28);
    });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(result.current.corner).toBe("top-right");
  });

  it("does not exit and snaps to the dropped corner after a drag", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const { result } = renderHook(() => useCornerSnap({ enabled: true, onClick }));

    act(() => {
      result.current.handlers.onPointerDown(makePointerDownEvent());
    });
    // Drag from top-right toward the bottom-left quadrant.
    act(() => {
      dispatchPointer("pointermove", 100, 700);
    });
    expect(result.current.isDragging).toBe(true);

    act(() => {
      dispatchPointer("pointerup", 100, 700);
    });

    expect(onClick).not.toHaveBeenCalled();
    // Corner commits after the snap animation timer.
    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.corner).toBe("bottom-left");
    expect(JSON.parse(mockStorage[CORNER_STORAGE_KEY])).toBe("bottom-left");

    vi.useRealTimers();
  });

  it("ignores a movement below the threshold", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useCornerSnap({ enabled: true, onClick }));

    act(() => {
      result.current.handlers.onPointerDown(makePointerDownEvent());
    });
    act(() => {
      dispatchPointer("pointermove", 974, 29); // ~2.2px, under the 4px threshold
    });
    expect(result.current.isDragging).toBe(false);

    act(() => {
      dispatchPointer("pointerup", 974, 29);
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("useCornerSnap enabled flag", () => {
  it("ignores pointer down when disabled", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useCornerSnap({ enabled: false, onClick }));

    act(() => {
      result.current.handlers.onPointerDown(makePointerDownEvent());
    });
    act(() => {
      dispatchPointer("pointerup", 972, 28);
    });

    // No gesture was started, so pointerup does nothing.
    expect(onClick).not.toHaveBeenCalled();
    expect(result.current.corner).toBe("top-right");
  });

  it("exits on Enter and Space key", () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useCornerSnap({ enabled: true, onClick }));

    act(() => {
      result.current.handlers.onKeyDown({
        key: "Enter",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(onClick).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handlers.onKeyDown({
        key: " ",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

afterEach(() => {
  vi.useRealTimers();
});
