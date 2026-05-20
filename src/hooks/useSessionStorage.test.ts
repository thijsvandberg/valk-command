import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionStorage } from "./useSessionStorage";

const mockStorage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  Object.defineProperty(window, "sessionStorage", {
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
});

describe("useSessionStorage", () => {
  it("returns default value when key does not exist", () => {
    const { result } = renderHook(() => useSessionStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("reads existing value from sessionStorage", async () => {
    mockStorage["test-key"] = JSON.stringify("stored");
    const { result, rerender } = renderHook(() =>
      useSessionStorage("test-key", "default"),
    );
    rerender();
    // useEffect hydration may take a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current[0]).toBe("stored");
  });

  it("writes value to sessionStorage on update", () => {
    const { result } = renderHook(() => useSessionStorage("test-key", "default"));

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(JSON.parse(mockStorage["test-key"])).toBe("updated");
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useSessionStorage<number>("counter", 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(JSON.parse(mockStorage["counter"])).toBe(2);
  });

  it("handles objects as values", () => {
    const { result } = renderHook(() =>
      useSessionStorage("obj", { a: 1, b: "two" }),
    );

    act(() => {
      result.current[1]({ a: 2, b: "three" });
    });

    expect(result.current[0]).toEqual({ a: 2, b: "three" });
  });
});
