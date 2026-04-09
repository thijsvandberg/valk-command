import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotification } from "./useNotification";

const mockStorage: Record<string, string> = {};

let mockPermission = "default";
let mockHidden = false;
const mockNotificationInstances: Array<{
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
  onclick: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
}> = [];

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  mockPermission = "default";
  mockHidden = false;
  mockNotificationInstances.length = 0;

  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = val; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => Object.keys(mockStorage).forEach((k) => delete mockStorage[k]),
    },
    writable: true,
  });

  Object.defineProperty(document, "hidden", {
    get: () => mockHidden,
    configurable: true,
  });

  const MockNotification = vi.fn(function (this: typeof mockNotificationInstances[0], title: string, options?: NotificationOptions) {
    this.title = title;
    this.body = options?.body;
    this.tag = options?.tag;
    this.icon = options?.icon;
    this.onclick = null;
    this.close = vi.fn();
    mockNotificationInstances.push(this);
  }) as unknown as typeof Notification;

  Object.defineProperty(MockNotification, "permission", {
    get: () => mockPermission,
    configurable: true,
  });
  MockNotification.requestPermission = vi.fn(async () => {
    mockPermission = "granted";
    return "granted" as NotificationPermission;
  });

  Object.defineProperty(window, "Notification", {
    value: MockNotification,
    writable: true,
    configurable: true,
  });
});

describe("useNotification", () => {
  it("defaults to enabled with current browser permission", () => {
    const { result } = renderHook(() => useNotification());
    expect(result.current.enabled).toBe(true);
    expect(result.current.permission).toBe("default");
  });

  it("reads disabled preference from localStorage", () => {
    mockStorage["bridge:notifications-enabled"] = "false";
    const { result } = renderHook(() => useNotification());
    expect(result.current.enabled).toBe(false);
  });

  it("toggles enabled state and persists to localStorage", () => {
    const { result } = renderHook(() => useNotification());

    act(() => {
      result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(JSON.parse(mockStorage["bridge:notifications-enabled"])).toBe(false);
  });

  it("requests browser permission", async () => {
    const { result } = renderHook(() => useNotification());

    let perm: string | undefined;
    await act(async () => {
      perm = await result.current.requestPermission();
    });

    expect(perm).toBe("granted");
    expect(result.current.permission).toBe("granted");
  });

  it("does not send notification when tab is visible", () => {
    mockPermission = "granted";
    mockHidden = false;

    const { result } = renderHook(() => useNotification());

    act(() => {
      result.current.notify("Test", { body: "Hello" });
    });

    expect(mockNotificationInstances).toHaveLength(0);
  });

  it("does not send notification when disabled", () => {
    mockPermission = "granted";
    mockHidden = true;
    mockStorage["bridge:notifications-enabled"] = "false";

    const { result } = renderHook(() => useNotification());

    act(() => {
      result.current.notify("Test", { body: "Hello" });
    });

    expect(mockNotificationInstances).toHaveLength(0);
  });

  it("does not send notification without permission", () => {
    mockPermission = "default";
    mockHidden = true;

    const { result } = renderHook(() => useNotification());

    act(() => {
      result.current.notify("Test", { body: "Hello" });
    });

    expect(mockNotificationInstances).toHaveLength(0);
  });

  it("sends notification when tab is hidden, enabled, and permission granted", () => {
    mockPermission = "granted";
    mockHidden = true;

    const { result } = renderHook(() => useNotification());

    act(() => {
      result.current.notify("Chat response ready", { body: "First line", tag: "chat" });
    });

    expect(mockNotificationInstances).toHaveLength(1);
    expect(mockNotificationInstances[0].title).toBe("Chat response ready");
    expect(mockNotificationInstances[0].body).toBe("First line");
    expect(mockNotificationInstances[0].tag).toBe("chat");
  });

  it("clicking notification focuses window and closes it", () => {
    mockPermission = "granted";
    mockHidden = true;
    const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});

    const { result } = renderHook(() => useNotification());

    const onClick = vi.fn();
    act(() => {
      result.current.notify("Test", { onClick });
    });

    const instance = mockNotificationInstances[0];
    act(() => {
      instance.onclick?.();
    });

    expect(focusSpy).toHaveBeenCalled();
    expect(instance.close).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  it("isTabHidden returns document.hidden value", () => {
    const { result } = renderHook(() => useNotification());

    mockHidden = false;
    expect(result.current.isTabHidden()).toBe(false);

    mockHidden = true;
    expect(result.current.isTabHidden()).toBe(true);
  });
});
