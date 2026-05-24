// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerSync,
  abortSync,
  unregisterSync,
  getActiveCount,
  abortAll,
} from "./sync-abort";

describe("sync-abort", () => {
  beforeEach(() => {
    abortAll();
  });

  it("registers and returns an AbortController", () => {
    const controller = registerSync("sync-1");
    expect(controller).toBeInstanceOf(AbortController);
    expect(controller.signal.aborted).toBe(false);
    expect(getActiveCount()).toBe(1);
  });

  it("aborts a registered sync", () => {
    const controller = registerSync("sync-1");
    const result = abortSync("sync-1");
    expect(result).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(getActiveCount()).toBe(0);
  });

  it("returns false when aborting unknown sync", () => {
    expect(abortSync("nonexistent")).toBe(false);
  });

  it("unregisters without aborting", () => {
    const controller = registerSync("sync-1");
    unregisterSync("sync-1");
    expect(controller.signal.aborted).toBe(false);
    expect(getActiveCount()).toBe(0);
  });

  it("abortAll aborts all registered syncs", () => {
    const c1 = registerSync("sync-1");
    const c2 = registerSync("sync-2");
    const ids = abortAll();
    expect(ids).toEqual(["sync-1", "sync-2"]);
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(getActiveCount()).toBe(0);
  });

  it("tracks active count correctly", () => {
    expect(getActiveCount()).toBe(0);
    registerSync("a");
    registerSync("b");
    registerSync("c");
    expect(getActiveCount()).toBe(3);
    abortSync("b");
    expect(getActiveCount()).toBe(2);
  });
});
