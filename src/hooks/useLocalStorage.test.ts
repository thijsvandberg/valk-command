import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "./useLocalStorage";

const mockStorage: Record<string, string> = {};
beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => Object.keys(mockStorage).forEach((k) => delete mockStorage[k]),
    },
    writable: true,
  });
});

describe("useLocalStorage", () => {
  it("returns default value when key does not exist", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("reads existing value from localStorage", () => {
    mockStorage["test-key"] = JSON.stringify("stored");
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));
    expect(result.current[0]).toBe("stored");
  });

  it("writes value to localStorage on update", () => {
    const { result } = renderHook(() => useLocalStorage("test-key", "default"));

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(JSON.parse(mockStorage["test-key"])).toBe("updated");
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useLocalStorage<number>("counter", 0));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });
    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
  });

  it("handles complex objects", () => {
    const defaultVal = { status: [] as string[], epic: [] as string[] };
    const { result } = renderHook(() => useLocalStorage("filters", defaultVal));

    act(() => {
      result.current[1]({ status: ["open"], epic: ["Backend"] });
    });

    expect(result.current[0]).toEqual({ status: ["open"], epic: ["Backend"] });
  });

  it("returns default when localStorage has invalid JSON", () => {
    mockStorage["broken"] = "not-json{";
    const { result } = renderHook(() => useLocalStorage("broken", 42));
    expect(result.current[0]).toBe(42);
  });

  it("syncs across tabs via storage event", () => {
    const { result } = renderHook(() => useLocalStorage("sync-key", "initial"));

    act(() => {
      mockStorage["sync-key"] = JSON.stringify("from-other-tab");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "sync-key",
          newValue: JSON.stringify("from-other-tab"),
        }),
      );
    });

    expect(result.current[0]).toBe("from-other-tab");
  });

  it("still syncs across tabs when the default is an object literal (no listener churn)", () => {
    // A fresh object default each render previously re-subscribed the storage
    // listener every render; the sync must keep working after the dep change.
    const { result, rerender } = renderHook(() =>
      useLocalStorage("obj-key", { status: [] as string[] }),
    );

    rerender();

    act(() => {
      mockStorage["obj-key"] = JSON.stringify({ status: ["open"] });
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "obj-key",
          newValue: JSON.stringify({ status: ["open"] }),
        }),
      );
    });

    expect(result.current[0]).toEqual({ status: ["open"] });
  });

  it("ignores storage events for other keys", () => {
    const { result } = renderHook(() => useLocalStorage("my-key", "initial"));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "other-key",
          newValue: JSON.stringify("nope"),
        }),
      );
    });

    expect(result.current[0]).toBe("initial");
  });
});
